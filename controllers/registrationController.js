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

// POST /api/registration
exports.createRegistration = async (req, res) => {
  try {
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

    // 3. Dynamic members validation
    const expectedAdditionalMembers = parsedSize - 1;
    const cleanMembers = Array.isArray(members) ? members.slice(0, expectedAdditionalMembers) : [];

    if (cleanMembers.length !== expectedAdditionalMembers) {
      return res.status(400).json({
        success: false,
        message: `For a team size of ${parsedSize}, exactly ${expectedAdditionalMembers} additional members must be provided.`
      });
    }

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

    // 5. Generate unique registration ID and save
    let registrationId = generateRegId();
    let collision = await EventRegistration.findOne({ registrationId });
    while (collision) {
      registrationId = generateRegId();
      collision = await EventRegistration.findOne({ registrationId });
    }

    const newRegistration = new EventRegistration({
      registrationId,
      eventName: eventName || 'THINKTANK IDEATHON 2026',
      teamName: teamName.trim(),
      teamSize: parsedSize,
      category,
      facultyMentor: facultyMentor.trim(),
      leader: {
        name: leader.name.trim(),
        email: leader.email.trim().toLowerCase(),
        mobile: leader.mobile.trim(),
        department: leader.department.trim()
      },
      members: formattedMembers,
      status: 'Confirmed'
    });

    const saved = await newRegistration.save();

    // Optional: Synchronize with Google Sheets Web App if configured
    if (process.env.GOOGLE_SHEETS_SCRIPT_URL) {
      try {
        const sheetsResp = await fetch(process.env.GOOGLE_SHEETS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow',
          body: JSON.stringify({
            teamName: saved.teamName,
            memberCount: saved.teamSize,
            category: saved.category,
            mentorName: saved.facultyMentor,
            leader: saved.leader,
            members: saved.members.map((m) => ({
              name: m.name,
              email: m.email,
              mobile: m.mobile,
              department: m.department
            }))
          })
        });
        const sheetsText = await sheetsResp.text();
        console.log(`[Google Sheets] Synced registration "${saved.registrationId}":`, sheetsText.substring(0, 150));
      } catch (sheetsErr) {
        console.warn('[Google Sheets Sync Error]:', sheetsErr.message);
      }
    }

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

// GET /api/registration (Admin listing)
exports.getAllRegistrations = async (req, res) => {
  try {
    const registrations = await EventRegistration.find().sort({ createdAt: -1 });
    return res.json({ success: true, count: registrations.length, data: registrations });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
