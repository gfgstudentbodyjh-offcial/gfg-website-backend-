const mongoose = require('mongoose');
const User = require('../models/User');
const Member = require('../models/Member');
const AdminAccess = require('../models/AdminAccess');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const Comment = require('../models/Comment');

// Defensive read resolver for multi-key Member resolution without data mutation
const findMemberByAnyIdentifier = async (target, currentUser = null) => {
  if (!target) return null;
  const cleanTarget = String(target).trim();
  if (!cleanTarget) return null;

  let member = null;

  // 1. Handle '/me' identifier -> authenticated User._id -> User.memberRef -> Member.userRef
  if (cleanTarget.toLowerCase() === 'me') {
    if (currentUser) {
      const userId = currentUser._id || currentUser.id;
      if (currentUser.memberRef) {
        member = await Member.findById(currentUser.memberRef);
      }
      if (!member && userId) {
        member = await Member.findOne({ userRef: userId });
      }
      if (!member && currentUser.email) {
        member = await Member.findOne({ email: currentUser.email.toLowerCase() });
      }
      if (member) return member;
    }
    return null;
  }

  // 2. Try User.memberRef & Member.userRef if target is a valid ObjectId
  if (mongoose.Types.ObjectId.isValid(cleanTarget)) {
    const userDoc = await User.findById(cleanTarget);
    if (userDoc && userDoc.memberRef) {
      member = await Member.findById(userDoc.memberRef);
      if (member) return member;
    }
    member = await Member.findOne({ userRef: cleanTarget });
    if (member) return member;

    member = await Member.findById(cleanTarget);
    if (member) return member;
  }

  // 3. Fall back to userCode, membershipId, username, email, legacyId, name
  const lowerTarget = cleanTarget.toLowerCase();
  const cleanName = lowerTarget.replace(/-/g, ' ');
  const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  member = await Member.findOne({
    $or: [
      { userCode: cleanTarget },
      { membershipId: cleanTarget },
      { username: lowerTarget },
      { email: lowerTarget },
      { legacyId: cleanTarget },
      { name: { $regex: new RegExp(`^${escapedName}$`, 'i') } }
    ]
  });

  return member;
};

// Get all members with search and role/team/accountType filter
exports.getMembers = async (req, res) => {
  try {
    const { search, team, role, status, accountType } = req.query;
    const query = { communityId: 'gfg-jamia-hamdard' };

    if (search) {
      const cleanSearch = search.trim();
      query.$or = [
        { name: { $regex: cleanSearch, $options: 'i' } },
        { email: { $regex: cleanSearch, $options: 'i' } },
        { username: { $regex: cleanSearch, $options: 'i' } },
        { membershipId: { $regex: cleanSearch, $options: 'i' } },
        { userCode: { $regex: cleanSearch, $options: 'i' } }
      ];
    }

    if (team && team !== 'All') query.teamName = team;
    
    if (role && role !== 'All') {
      if (role === 'Visitors') {
        query.$or = [
          { accountType: { $regex: /^visitor$/i } },
          { role: { $regex: /^visitor$/i } }
        ];
      } else if (role === 'Members') {
        query.accountType = { $regex: /^member$/i };
      } else if (role === 'Leads') {
        query.role = { $regex: /\blead\b/i };
      } else if (role === 'Co-Leads') {
        query.role = { $regex: /co-lead/i };
      } else if (role === 'Campus Ambassadors') {
        query.role = { $regex: /ambassador/i };
      } else if (role === 'Campus Mantri') {
        query.role = { $regex: /mantri/i };
      } else if (role === 'Faculty') {
        query.role = { $regex: /faculty/i };
      } else if (role === 'Inactive') {
        query.$or = [
          { status: 'Inactive' },
          { membershipStatus: 'suspended' },
          { membershipStatus: 'revoked' }
        ];
      } else {
        query.role = role;
      }
    }

    if (status && status !== 'All') {
      if (status === 'pending') {
        query.membershipStatus = { $regex: /^pending$/i };
      } else if (status === 'Active') {
        query.status = 'Active';
        query.membershipStatus = { $nin: ['suspended', 'revoked', 'inactive', 'expired'] };
      } else {
        query.status = status;
      }
    }

    if (accountType && accountType !== 'All') {
      query.accountType = { $regex: new RegExp(`^${accountType}$`, 'i') };
    }

    if (mongoose.connection.readyState === 1) {
      const members = await Member.find(query).populate('userRef', '-password -pinHash -otpSecret -resetToken').sort({ createdAt: -1 });
      return res.json({ success: true, count: members.length, data: members });
    } else {
      console.warn('[Member Controller]: DB not connected, returning empty array');
      return res.json({ success: true, count: 0, data: [] });
    }
  } catch (error) {
    console.error('[Member Controller Error]:', error);
    return res.status(500).json({ success: false, message: error.message, data: [] });
  }
};

// Create member
exports.createMember = async (req, res) => {
  try {
    const memberData = {
      communityId: 'gfg-jamia-hamdard',
      accountType: req.body.accountType || 'Visitor',
      role: req.body.role || 'Visitor',
      membershipStatus: req.body.membershipStatus || 'pending',
      ...req.body
    };

    const member = await Member.create(memberData);
    req.app.get('io')?.emit('admin:member-created', { member });
    return res.status(201).json({ success: true, data: member });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// Update member (Admin full access)
exports.updateMember = async (req, res) => {
  try {
    const member = await Member.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    req.app.get('io')?.emit('admin:member-updated', { member });
    return res.json({ success: true, data: member });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// Generate sequential unique Member ID based on highest existing numerical suffix
const generateUniqueMembershipId = async (year = '2026') => {
  const existingMembers = await Member.find(
    { membershipId: { $regex: new RegExp(`^GFG-JH-${year}-\\d+$`, 'i') } },
    { membershipId: 1 }
  ).lean();

  let maxSeq = 0;
  existingMembers.forEach(m => {
    if (m.membershipId) {
      const match = m.membershipId.match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  });

  const nextSeq = maxSeq + 1;
  return `GFG-JH-${year}-${String(nextSeq).padStart(3, '0')}`;
};

// Change Membership & Official Role (Visitor -> Member promotion handler)
exports.updateMembership = async (req, res) => {
  const { id } = req.params;
  const { accountType, role, membershipStatus, session, teamName } = req.body;

  try {
    const member = await Member.findById(id);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

    if (accountType) member.accountType = accountType;
    if (role) {
      member.role = role;
      if (!teamName) {
        if (role.startsWith('Technical')) member.teamName = 'Technical';
        else if (role.startsWith('Event')) member.teamName = 'Event';
        else if (role.startsWith('PR')) member.teamName = 'PR';
        else if (role.startsWith('Design')) member.teamName = 'Design';
        else if (role.startsWith('Social Media')) member.teamName = 'Social Media';
        else if (role.startsWith('Media')) member.teamName = 'Media Team';
        else if (role.startsWith('Editorial')) member.teamName = 'Editorial Team';
        else if (role.startsWith('Data & Form')) member.teamName = 'Data & Form Team';
        else if (role.startsWith('Community')) member.teamName = 'Community';
        else if (role === 'Campus Mantri') member.teamName = 'Leadership';
        else if (role === 'Faculty Coordinator') member.teamName = 'Faculty';
        else member.teamName = 'General';
      }
    }
    if (membershipStatus) member.membershipStatus = membershipStatus;
    if (session) member.session = session;
    if (teamName) member.teamName = teamName;

    // Auto generate unique Member ID based on max sequence if promoted to official Member
    if ((accountType === 'Member' || accountType === 'member') && !member.membershipId) {
      member.membershipId = await generateUniqueMembershipId('2026');
      member.verificationId = `v_${member._id}_${Date.now()}`;
      member.issueDate = new Date();
    }

    await member.save();

    // Emit real-time invalidation event
    req.app.get('io')?.emit('admin:member-updated', { member });

    return res.json({ success: true, data: member, message: 'Membership status and official role updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Update Member Status (Suspend / Revoke / Restore)
exports.updateMemberStatus = async (req, res) => {
  const { id } = req.params;
  const { status, membershipStatus } = req.body;

  try {
    const member = await Member.findById(id);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

    if (status) member.status = status;
    if (membershipStatus) member.membershipStatus = membershipStatus;

    await member.save();
    req.app.get('io')?.emit('admin:member-updated', { member });
    return res.json({ success: true, data: member, message: `Member status updated to ${status}` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Member self profile update
exports.updateSelfProfile = async (req, res) => {
  const memberId = req.params.id || req.body.memberId;
  const {
    photo, photoPublicId, coverPhoto, coverPhotoPublicId, bio, about, skills, expertise,
    github, linkedin, portfolio, instagram, website
  } = req.body;

  try {
    let filter = {};
    if (mongoose.Types.ObjectId.isValid(memberId)) {
      filter = { $or: [{ _id: memberId }, { userRef: memberId }] };
    } else {
      filter = { $or: [{ legacyId: memberId }, { membershipId: memberId }, { email: memberId }, { username: memberId }] };
    }

    const targetMember = await Member.findOne(filter);
    if (!targetMember) {
      return res.status(404).json({ success: false, message: 'Member profile not found' });
    }

    // Strict Server-Side Authorization Check
    if (req.user) {
      const callingUserId = req.user._id ? req.user._id.toString() : (req.user.id ? req.user.id.toString() : '');
      const isAdmin = Boolean(req.user.isAdmin || req.user.adminRole === 'ROOT_SUPER_ADMIN');

      const ownerUserId = targetMember.userRef ? targetMember.userRef.toString() : '';
      const ownerMemberId = targetMember._id.toString();

      const isAuthorized = isAdmin || (callingUserId && (callingUserId === ownerUserId || callingUserId === ownerMemberId));

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You can only edit your own profile.'
        });
      }
    }

    const allowedUpdates = {
      ...(photo !== undefined && { photo }),
      ...(photoPublicId !== undefined && { photoPublicId }),
      ...(coverPhoto !== undefined && { coverPhoto }),
      ...(coverPhotoPublicId !== undefined && { coverPhotoPublicId }),
      ...(bio !== undefined && { bio }),
      ...(about !== undefined && { about }),
      ...(skills !== undefined && { skills }),
      ...(expertise !== undefined && { expertise }),
      ...(github !== undefined && { github }),
      ...(linkedin !== undefined && { linkedin }),
      ...(portfolio !== undefined && { portfolio }),
      ...(instagram !== undefined && { instagram }),
      ...(website !== undefined && { website })
    };

    const updated = await Member.findByIdAndUpdate(targetMember._id, allowedUpdates, { new: true, runValidators: true });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// Get single member profile
exports.getProfile = async (req, res) => {
  const { id } = req.params;

  try {
    const member = await findMemberByAnyIdentifier(id, req.user);
    if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });
    return res.json({ success: true, data: member });
  } catch (error) {
    console.error('[getProfile Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Verify Member DTO
exports.verifyMember = async (req, res) => {
  const { verificationId } = req.params;

  try {
    const query = {
      $or: [
        { verificationId },
        { membershipId: verificationId }
      ]
    };
    if (mongoose.Types.ObjectId.isValid(verificationId)) {
      query.$or.push({ _id: verificationId });
    }

    const member = await Member.findOne(query);
    if (!member) return res.status(404).json({ success: false, message: 'Verification badge not found' });

    return res.json({
      success: true,
      data: {
        name: member.name,
        photo: member.photo,
        role: member.role,
        teamName: member.teamName,
        chapter: 'GeeksforGeeks Jamia Hamdard',
        membershipId: member.membershipId || 'GFG-JH-2026-001',
        membershipStatus: member.membershipStatus || 'active',
        session: member.session || '2026–27',
        verifiedAt: new Date(member.createdAt || Date.now()).toLocaleDateString()
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Delete member (Removes community membership record while preserving platform User account)
exports.deleteMember = async (req, res) => {
  try {
    const { id } = req.params;
    const member = await Member.findById(id);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    // SERVER-SIDE HARD PROTECTION FOR ROOT SUPER ADMIN
    let linkedUserId = member.userRef;
    if (!linkedUserId && member.email) {
      const linkedUser = await User.findOne({ email: member.email.toLowerCase() });
      if (linkedUser) linkedUserId = linkedUser._id;
    }

    if (linkedUserId) {
      const user = await User.findById(linkedUserId);
      if (user) {
        const adminAccess = await AdminAccess.findOne({ userRef: user._id });
        if (
          user.role === 'Super Admin' ||
          (adminAccess && adminAccess.adminRole === 'ROOT_SUPER_ADMIN') ||
          user.email === 'admin@gfgcampus.org'
        ) {
          return res.status(403).json({ success: false, message: 'Root Super Admin cannot be deleted.' });
        }

        // Unset User.memberRef ONLY if it points to this Member being removed
        if (user.memberRef && user.memberRef.toString() === member._id.toString()) {
          user.memberRef = undefined;
          await user.save();
        }
      }
    }

    // Delete ONLY the Member collection document
    await Member.findByIdAndDelete(member._id);

    req.app.get('io')?.emit('admin:member-updated', { memberId: member._id });
    return res.json({
      success: true,
      message: 'Community membership removed successfully. Platform user account and credentials preserved.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// CSV Import handler
exports.importCSV = async (req, res) => {
  try {
    const { membersList } = req.body;
    if (!Array.isArray(membersList) || membersList.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty members list array' });
    }

    const inserted = await Member.insertMany(membersList.map(m => ({
      ...m,
      communityId: 'gfg-jamia-hamdard'
    })));

    req.app.get('io')?.emit('admin:member-created', { count: inserted.length });
    return res.json({ success: true, count: inserted.length, message: `Successfully imported ${inserted.length} members` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/members/me/posts — Returns current authenticated member's posts by canonical Member._id
exports.getMyPosts = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    let member = await Member.findOne({ userRef: req.user._id });
    if (!member && req.user.email) {
      member = await Member.findOne({ email: req.user.email });
    }
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member profile not found' });
    }

    const posts = await Post.find({
      authorRef: member._id,
      moderationStatus: { $nin: ['removed', 'hidden'] }
    }).populate('authorRef', 'name photo role teamName email').sort({ createdAt: -1 });

    return res.json({ success: true, count: posts.length, posts, data: posts });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/members/:memberId/posts — Returns specified member's posts by canonical Member._id
exports.getMemberPosts = async (req, res) => {
  try {
    const { id, memberId: paramMemberId } = req.params;
    const inputId = id || paramMemberId;
    
    const member = await findMemberByAnyIdentifier(inputId, req.user);
    if (!member) {
      return res.json({ success: true, count: 0, data: [], posts: [] });
    }

    const targetMemberId = member._id;

    let posts = await Post.find({
      authorRef: targetMemberId,
      moderationStatus: { $nin: ['removed', 'hidden'] }
    })
      .populate('authorRef', 'name photo role teamName email userCode')
      .sort({ createdAt: -1 })
      .lean();

    let currentMemberId = null;
    if (req.user) {
      const currentMember = await Member.findOne({ userRef: req.user._id });
      if (currentMember) currentMemberId = currentMember._id;
    }

    if (currentMemberId) {
      const postIds = posts.map(p => p._id);
      const [userLikes, userBookmarks] = await Promise.all([
        Like.find({ memberRef: currentMemberId, postRef: { $in: postIds } }).select('postRef'),
        Bookmark.find({ memberRef: currentMemberId, postRef: { $in: postIds } }).select('postRef')
      ]);

      const likedSet = new Set(userLikes.map(l => l.postRef.toString()));
      const bookmarkedSet = new Set(userBookmarks.map(b => b.postRef.toString()));

      posts = posts.map(p => ({
        ...p,
        isLiked: likedSet.has(p._id.toString()),
        isBookmarked: bookmarkedSet.has(p._id.toString())
      }));
    } else {
      posts = posts.map(p => ({ ...p, isLiked: false, isBookmarked: false }));
    }

    return res.json({ success: true, count: posts.length, data: posts, posts });
  } catch (err) {
    console.error('[getMemberPosts Error]:', err);
    return res.status(500).json({ success: false, error: err.message, data: [], posts: [] });
  }
};

// GET /api/members/profile/:identifier — Returns public sanitized profile by Member._id, User._id, or username
exports.getPublicProfile = async (req, res) => {
  const { identifier, username } = req.params;
  const target = (identifier || username || '').trim();

  try {
    if (!target) {
      return res.status(400).json({ success: false, message: 'Member identifier required' });
    }

    const member = await findMemberByAnyIdentifier(target, req.user);

    if (!member) {
      return res.status(404).json({ success: false, message: 'Member profile not found' });
    }

    const postsCount = await Post.countDocuments({
      authorRef: member._id,
      moderationStatus: { $nin: ['removed', 'hidden'] }
    });

    // Whitelist ONLY public safe fields (Strict Privacy)
    const publicProfile = {
      _id: member._id,
      userCode: member.userCode,
      username: member.username || member._id.toString(),
      name: member.name,
      photo: member.photo,
      coverPhoto: member.coverPhoto,
      role: member.role || 'Member',
      teamName: member.teamName || 'General',
      accountType: member.accountType || 'Visitor',
      bio: member.bio || '',
      about: member.about || '',
      college: member.college || 'Jamia Hamdard',
      department: member.department || 'Computer Science & Engineering',
      skills: member.skills || [],
      expertise: member.expertise || [],
      interests: member.interests || [],
      github: member.github || '',
      linkedin: member.linkedin || '',
      portfolio: member.portfolio || '',
      instagram: member.instagram || '',
      website: member.website || '',
      session: member.session || '2026–27',
      membershipId: member.membershipId || '',
      membershipStatus: member.membershipStatus || 'pending',
      status: member.status || 'Active',
      verificationId: member.verificationId || member.membershipId || member._id?.toString(),
      issueDate: member.issueDate || member.createdAt,
      joinedAt: member.createdAt,
      postsCount
    };

    return res.json({ success: true, member: publicProfile, data: publicProfile });
  } catch (err) {
    console.error('[getPublicProfile Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/members/profile/:identifier/posts — Returns public member's canonical posts
exports.getPublicMemberPosts = async (req, res) => {
  const { identifier, username } = req.params;
  const target = (identifier || username || '').trim();

  try {
    if (!target) {
      return res.json({ success: true, count: 0, posts: [], data: [] });
    }

    const member = await findMemberByAnyIdentifier(target, req.user);

    if (!member) {
      return res.json({ success: true, count: 0, posts: [], data: [] });
    }

    let posts = await Post.find({
      authorRef: member._id,
      moderationStatus: { $nin: ['removed', 'hidden'] }
    })
      .populate('authorRef', 'name photo role teamName username userCode')
      .sort({ createdAt: -1 })
      .lean();

    let currentMemberId = null;
    if (req.user) {
      const currentMember = await Member.findOne({ userRef: req.user._id });
      if (currentMember) currentMemberId = currentMember._id;
    }

    if (currentMemberId) {
      const postIds = posts.map(p => p._id);
      const [userLikes, userBookmarks] = await Promise.all([
        Like.find({ memberRef: currentMemberId, postRef: { $in: postIds } }).select('postRef'),
        Bookmark.find({ memberRef: currentMemberId, postRef: { $in: postIds } }).select('postRef')
      ]);

      const likedSet = new Set(userLikes.map(l => l.postRef.toString()));
      const bookmarkedSet = new Set(userBookmarks.map(b => b.postRef.toString()));

      posts = posts.map(p => ({
        ...p,
        isLiked: likedSet.has(p._id.toString()),
        isBookmarked: bookmarkedSet.has(p._id.toString())
      }));
    } else {
      posts = posts.map(p => ({ ...p, isLiked: false, isBookmarked: false }));
    }

    return res.json({ success: true, count: posts.length, posts, data: posts });
  } catch (err) {
    console.error('[getPublicMemberPosts Error]:', err);
    return res.status(500).json({ success: false, error: err.message, posts: [], data: [] });
  }
};

// GET /api/members/active — Calculates top active members over last 30 days based on real community activity
exports.getActiveMembers = async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json({ success: true, count: 0, members: [], data: [] });
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const members = await Member.find({ communityId: 'gfg-jamia-hamdard', status: 'Active' })
      .select('_id userCode name username photo role teamName accountType')
      .lean();

    const [recentPosts, recentComments] = await Promise.all([
      Post.find({
        communityId: 'gfg-jamia-hamdard',
        status: 'Active',
        moderationStatus: { $nin: ['hidden', 'removed'] },
        createdAt: { $gte: thirtyDaysAgo }
      }).select('authorRef likesCount bookmarksCount createdAt').lean(),

      Comment.find({
        communityId: 'gfg-jamia-hamdard',
        moderationStatus: { $nin: ['hidden', 'removed'] },
        isDeleted: { $ne: true },
        createdAt: { $gte: thirtyDaysAgo }
      }).select('authorRef likesCount createdAt parentCommentId').lean()
    ]);

    const memberScores = members.map((m) => {
      const mId = m._id.toString();

      const memberPosts = recentPosts.filter(p => p.authorRef && p.authorRef.toString() === mId);
      const memberComments = recentComments.filter(c => c.authorRef && c.authorRef.toString() === mId);

      const postsCount = memberPosts.length;
      const topCommentsCount = memberComments.filter(c => !c.parentCommentId).length;
      const repliesCount = memberComments.filter(c => c.parentCommentId).length;

      const postLikesReceived = memberPosts.reduce((acc, p) => acc + (p.likesCount || 0), 0);
      const commentLikesReceived = memberComments.reduce((acc, c) => acc + (c.likesCount || 0), 0);
      const savesReceived = memberPosts.reduce((acc, p) => acc + (p.bookmarksCount || 0), 0);

      const score = (postsCount * 10) +
                    (topCommentsCount * 5) +
                    (repliesCount * 3) +
                    (postLikesReceived * 2) +
                    (commentLikesReceived * 1) +
                    (savesReceived * 3);

      let lastActivityAt = null;
      memberPosts.forEach(p => {
        if (!lastActivityAt || new Date(p.createdAt) > lastActivityAt) lastActivityAt = new Date(p.createdAt);
      });
      memberComments.forEach(c => {
        if (!lastActivityAt || new Date(c.createdAt) > lastActivityAt) lastActivityAt = new Date(c.createdAt);
      });

      return {
        _id: m._id,
        userCode: m.userCode || '',
        fullName: m.name || 'Community Member',
        name: m.name || 'Community Member',
        username: m.username || m._id.toString(),
        photo: m.photo || '',
        avatar: { url: m.photo || '' },
        role: m.role || 'Member',
        teamName: m.teamName || 'General',
        activityScore: score,
        lastActivityAt: lastActivityAt || null
      };
    });

    const activeOnly = memberScores.filter(m => m.activityScore > 0);
    activeOnly.sort((a, b) => {
      if (b.activityScore !== a.activityScore) return b.activityScore - a.activityScore;
      return (b.lastActivityAt || 0) - (a.lastActivityAt || 0);
    });

    const resultMembers = activeOnly.length > 0
      ? activeOnly.slice(0, 5)
      : members.slice(0, 4).map(m => ({
          _id: m._id,
          userCode: m.userCode || '',
          fullName: m.name,
          name: m.name,
          username: m.username || m._id.toString(),
          photo: m.photo || '',
          avatar: { url: m.photo || '' },
          role: m.role || 'Member',
          teamName: m.teamName || 'General',
          activityScore: 0
        }));

    return res.json({
      success: true,
      count: resultMembers.length,
      members: resultMembers,
      data: resultMembers
    });
  } catch (err) {
    console.error('[getActiveMembers Error]:', err);
    return res.status(500).json({ success: false, error: err.message, members: [], data: [] });
  }
};
