const EventRegistration = require('../models/EventRegistration');

// Generate unique registration ID
const generateRegId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GFG-${new Date().getFullYear()}-${code}`;
};

// Registration Status Flag for THINKTANK IDEATHON 2026
const IS_REGISTRATION_OPEN = false;

// POST /api/registration
exports.createRegistration = async (req, res) => {
  try {
    // Check if registration is closed
    if (!IS_REGISTRATION_OPEN) {
      return res.status(403).json({
        success: false,
        message: 'Registrations for THINKTANK IDEATHON 2026 are officially closed. Thank you for your interest!'
      });
    }

    const {
      eventName,
      teamName,
      teamSize,
      category,
      facultyMentor,
      leader,
      members
    } = req.body;

    // 1. Basic validation
    if (!teamName || !teamName.trim()) {
      return res.status(400).json({ success: false, message: 'Team Name is required.' });
    }

    const parsedSize = parseInt(teamSize, 10);
    if (!parsedSize || parsedSize < 3 || parsedSize > 6) {
      return res.status(400).json({
        success: false,
        message: 'Team size must be between 3 and 6 members (including Team Leader).'
      });
    }

    if (!category || !['Technical Track', 'Non-Technical Track'].includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Valid category track is required (Technical Track or Non-Technical Track).'
      });
    }

    if (!facultyMentor || !facultyMentor.trim()) {
      return res.status(400).json({ success: false, message: 'Faculty Mentor Name is required.' });
    }

    // 2. Leader validation
    if (!leader || !leader.name || !leader.email || !leader.mobile || !leader.department) {
      return res.status(400).json({
        success: false,
        message: 'All Team Leader details (Name, Email, Mobile No., Department) are required.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leader.email.trim())) {
      return res.status(400).json({ success: false, message: 'Invalid Team Leader email address.' });
    }

    // Dynamic members validation
    const expectedAdditionalMembers = parsedSize - 1;
    const cleanMembers = Array.isArray(members) ? members.slice(0, expectedAdditionalMembers) : [];

    if (cleanMembers.length !== expectedAdditionalMembers) {
      return res.status(400).json({
        success: false,
        message: `For a team size of ${parsedSize}, exactly ${expectedAdditionalMembers} additional members must be provided.`
      });
    }

    const cleanLeaderEmail = leader.email.trim().toLowerCase();
    const cleanLeaderMobile = leader.mobile.trim();

    // 3. Intra-team email uniqueness validation (Prevents Google Apps Script rejection)
    const emailMap = new Map();
    emailMap.set(cleanLeaderEmail, 'Team Leader');

    for (let i = 0; i < cleanMembers.length; i++) {
      const m = cleanMembers[i];
      const memberNumber = i + 2;
      if (!m.name || !m.name.trim()) {
        return res.status(400).json({ success: false, message: `Member ${memberNumber} Name is required.` });
      }
      if (!m.email || !emailRegex.test(m.email.trim())) {
        return res.status(400).json({ success: false, message: `Valid email is required for Member ${memberNumber}.` });
      }
      if (!m.mobile || !m.mobile.trim()) {
        return res.status(400).json({ success: false, message: `Mobile number is required for Member ${memberNumber}.` });
      }
      if (!m.department || !m.department.trim()) {
        return res.status(400).json({ success: false, message: `Department is required for Member ${memberNumber}.` });
      }

      const memEmail = m.email.trim().toLowerCase();
      if (emailMap.has(memEmail)) {
        return res.status(400).json({
          success: false,
          message: `Each team member must have a unique email address. "${memEmail}" is entered for both ${emailMap.get(memEmail)} and Member ${memberNumber}.`
        });
      }
      emailMap.set(memEmail, `Member ${memberNumber}`);
    }

    // Format member array with memberIndex
    const formattedMembers = cleanMembers.map((m, idx) => ({
      memberIndex: idx + 2,
      name: m.name.trim(),
      email: m.email.trim().toLowerCase(),
      mobile: m.mobile.trim(),
      department: m.department.trim()
    }));

    // 4. Check for duplicate team name in same community / event
    const existingTeam = await EventRegistration.findOne({
      teamName: { $regex: new RegExp(`^${teamName.trim()}$`, 'i') }
    });
    if (existingTeam) {
      return res.status(409).json({
        success: false,
        message: `A team named "${teamName.trim()}" is already registered. Please choose a unique team name.`
      });
    }

    // 5. Synchronize with Google Sheets Web App FIRST if configured (Two-phase reliable write)
    let sheetsRegistrationId = null;
    let sheetsSyncSuccess = false;
    let sheetsSyncError = null;

    if (process.env.GOOGLE_SHEETS_SCRIPT_URL) {
      try {
        const sheetsPayload = {
          teamName: teamName.trim(),
          memberCount: parsedSize,
          category,
          mentorName: facultyMentor.trim(),
          leader: {
            name: leader.name.trim(),
            email: cleanLeaderEmail,
            mobile: cleanLeaderMobile,
            department: leader.department.trim()
          },
          members: formattedMembers.map((m) => ({
            name: m.name,
            email: m.email,
            mobile: m.mobile,
            department: m.department
          }))
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

        const sheetsResp = await fetch(process.env.GOOGLE_SHEETS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow',
          body: JSON.stringify(sheetsPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!sheetsResp.ok) {
          const errText = await sheetsResp.text();
          throw new Error(`Google Sheets responded with HTTP ${sheetsResp.status}: ${errText.substring(0, 100)}`);
        }

        const sheetsData = await sheetsResp.json();
        if (!sheetsData || !sheetsData.success) {
          const failureReason = sheetsData?.message || 'Google Sheets rejected the registration submission.';
          console.error('[Google Sheets Sync Rejected]:', failureReason);
          return res.status(422).json({
            success: false,
            message: failureReason
          });
        }

        sheetsRegistrationId = sheetsData.registrationId;
        sheetsSyncSuccess = true;
        console.log(`[Google Sheets] Successfully confirmed persistence for team "${teamName.trim()}": ${sheetsRegistrationId}`);
      } catch (sheetsErr) {
        sheetsSyncError = sheetsErr.message;
        console.error('[Google Sheets Write Failure]:', sheetsErr);
        // Do NOT report false success if Google Sheets write failed
        return res.status(502).json({
          success: false,
          message: `Unable to persist registration in official records: ${sheetsErr.name === 'AbortError' ? 'Google Sheets service timed out. Please try again.' : sheetsErr.message}`
        });
      }
    }

    // 6. Generate stable registration ID (use Google Sheets ID if available, otherwise generate fallback)
    let registrationId = sheetsRegistrationId || generateRegId();
    let collision = await EventRegistration.findOne({ registrationId });
    while (collision && !sheetsRegistrationId) {
      registrationId = generateRegId();
      collision = await EventRegistration.findOne({ registrationId });
    }

    // 7. Persist to MongoDB Database
    const newRegistration = new EventRegistration({
      registrationId,
      sheetsRegistrationId: sheetsRegistrationId || null,
      sheetsSyncStatus: sheetsSyncSuccess ? 'Synced' : 'Failed',
      sheetsSyncError: sheetsSyncError || null,
      sheetsSyncedAt: sheetsSyncSuccess ? new Date() : null,
      eventName: eventName || 'THINKTANK IDEATHON 2026',
      teamName: teamName.trim(),
      teamSize: parsedSize,
      category,
      facultyMentor: facultyMentor.trim(),
      leader: {
        name: leader.name.trim(),
        email: cleanLeaderEmail,
        mobile: cleanLeaderMobile,
        department: leader.department.trim()
      },
      members: formattedMembers,
      status: 'Confirmed'
    });

    const saved = await newRegistration.save();

    return res.status(201).json({
      success: true,
      message: `Registration confirmed for Team "${saved.teamName}"!`,
      data: saved
    });
  } catch (err) {
    console.error('Registration submission error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'An unexpected error occurred while saving registration.'
    });
  }
};

// GET /api/registration/:id
exports.getRegistrationById = async (req, res) => {
  try {
    const { id } = req.params;
    const registration = await EventRegistration.findOne({
      $or: [{ registrationId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }]
    });

    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration record not found.' });
    }

    return res.json({ success: true, data: registration });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/registration/:id/sync (Retry syncing a specific registration to Google Sheets)
exports.syncRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const registration = await EventRegistration.findOne({
      $or: [{ registrationId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }]
    });

    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration record not found.' });
    }

    if (!process.env.GOOGLE_SHEETS_SCRIPT_URL) {
      return res.status(503).json({ success: false, message: 'Google Sheets sync URL not configured.' });
    }

    // Intra-team email validation check
    const emails = [registration.leader.email.trim().toLowerCase(), ...registration.members.map(m => m.email.trim().toLowerCase())];
    const emailSet = new Set(emails);
    if (emails.length !== emailSet.size) {
      return res.status(400).json({
        success: false,
        message: 'Cannot sync: Registration contains duplicate emails among members. Please correct member emails first.'
      });
    }

    const sheetsPayload = {
      teamName: registration.teamName,
      memberCount: registration.teamSize,
      category: registration.category,
      mentorName: registration.facultyMentor,
      leader: {
        name: registration.leader.name,
        email: registration.leader.email,
        mobile: registration.leader.mobile,
        department: registration.leader.department
      },
      members: registration.members.map(m => ({
        name: m.name,
        email: m.email,
        mobile: m.mobile,
        department: m.department
      }))
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const sheetsResp = await fetch(process.env.GOOGLE_SHEETS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify(sheetsPayload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!sheetsResp.ok) {
      throw new Error(`Google Sheets responded with HTTP ${sheetsResp.status}`);
    }

    const sheetsData = await sheetsResp.json();
    if (!sheetsData || !sheetsData.success) {
      registration.sheetsSyncStatus = 'Failed';
      registration.sheetsSyncError = sheetsData?.message || 'Sync rejected by Google Sheets';
      await registration.save();
      return res.status(422).json({ success: false, message: registration.sheetsSyncError });
    }

    registration.sheetsRegistrationId = sheetsData.registrationId;
    registration.sheetsSyncStatus = 'Synced';
    registration.sheetsSyncError = null;
    registration.sheetsSyncedAt = new Date();
    await registration.save();

    return res.json({
      success: true,
      message: `Successfully synchronized registration with Google Sheets: ${sheetsData.registrationId}`,
      data: registration
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to synchronize with Google Sheets: ' + err.message
    });
  }
};

// GET /api/registration/audit/report (Integrity and discrepancy report)
exports.getRegistrationAudit = async (req, res) => {
  try {
    const registrations = await EventRegistration.find().sort({ createdAt: -1 });

    const audit = {
      totalMongoRecords: registrations.length,
      syncedWithSheets: registrations.filter(r => r.sheetsSyncStatus === 'Synced').length,
      pendingOrFailed: registrations.filter(r => r.sheetsSyncStatus !== 'Synced').length,
      duplicateEmailIssues: [],
      memberCountIssues: []
    };

    registrations.forEach(r => {
      const expectedMembers = (r.teamSize || 3) - 1;
      const actualMembers = r.members ? r.members.length : 0;
      if (expectedMembers !== actualMembers) {
        audit.memberCountIssues.push({
          teamName: r.teamName,
          registrationId: r.registrationId,
          expected: expectedMembers,
          actual: actualMembers
        });
      }

      const emails = [r.leader?.email, ...(r.members || []).map(m => m.email)].filter(Boolean).map(e => e.toLowerCase());
      const emailSet = new Set(emails);
      if (emails.length !== emailSet.size) {
        audit.duplicateEmailIssues.push({
          teamName: r.teamName,
          registrationId: r.registrationId,
          emails
        });
      }
    });

    return res.json({ success: true, data: audit });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/registration (Admin listing)
exports.getAllRegistrations = async (req, res) => {
  try {
    const registrations = await EventRegistration.find().sort({ createdAt: -1 });
    return res.json({ success: true, count: registrations.length, data: registrations });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
