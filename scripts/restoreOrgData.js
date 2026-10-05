const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Member = require('../models/Member');
const CampusMantri = require('../models/CampusMantri');
const Team = require('../models/Team');

const COMMUNITY_ID = 'gfg-jamia-hamdard';

async function restoreOrgData() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is missing in .env');
    }

    console.log('[Restore] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[Restore] Connected successfully.');

    // ─── 1. Helper to find or create member safely ─────────────────────────
    const ensureMember = async ({ name, username, email, role, teamName, photo, bio, socials }) => {
      let member = await Member.findOne({
        communityId: COMMUNITY_ID,
        $or: [
          ...(email ? [{ email: new RegExp(`^${email.trim()}$`, 'i') }] : []),
          ...(username ? [{ username: username.trim() }] : []),
          { name: new RegExp(`^${name.trim()}$`, 'i') }
        ]
      });

      if (!member) {
        console.log(`[Restore] Creating clean Member record for: ${name}`);
        const userCode = `GFGJH-U-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        member = await Member.create({
          communityId: COMMUNITY_ID,
          userCode,
          username: username || name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          name,
          email: email || `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@gfgcampus.org`,
          role: role || 'Member',
          teamName: teamName || 'General',
          photo: photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2f9e44&color=fff&bold=true`,
          bio: bio || '',
          about: bio || `Member of ${teamName || 'GFG Campus Community'}`,
          linkedin: socials?.linkedin || '',
          github: socials?.github || '',
          instagram: socials?.instagram || ''
        });
      } else {
        // Update organizational tags & missing details non-destructively
        const updates = {};
        if (role && (!member.role || member.role === 'Visitor' || member.role === 'Member')) {
          updates.role = role;
        }
        if (teamName && (!member.teamName || member.teamName === 'General')) {
          updates.teamName = teamName;
        }
        if (!member.photo || member.photo.includes('ui-avatars.com')) {
          if (photo) updates.photo = photo;
        }
        if (!member.bio && bio) {
          updates.bio = bio;
        }
        if (!member.linkedin && socials?.linkedin) updates.linkedin = socials.linkedin;
        if (!member.github && socials?.github) updates.github = socials.github;
        if (!member.instagram && socials?.instagram) updates.instagram = socials.instagram;

        if (Object.keys(updates).length > 0) {
          await Member.updateOne({ _id: member._id }, { $set: updates });
          member = await Member.findById(member._id);
        }
      }

      return member;
    };

    // ─── 2. Resolve/Restore All Historical Members ─────────────────────────
    console.log('[Restore] Resolving historical leads and members...');

    const aliRaza = await ensureMember({
      name: 'Ali Raza',
      username: 'ali_raza',
      email: 'alirazajh47@gmail.com',
      role: 'Campus Mantri',
      teamName: 'Leadership',
      photo: '/assets/leadership/campus-mantri-2025-26.jpg',
      bio: 'Former Campus Mantri at GeeksforGeeks, passionate about building a strong tech community by organizing impactful events, encouraging peer learning, and connecting students with opportunities to learn, grow, and advance their careers.',
      socials: {
        linkedin: 'https://www.linkedin.com/in/ali-raza-bba428396',
        instagram: 'https://www.instagram.com/im_alyraza'
      }
    });

    const saquibSarfaraz = await ensureMember({
      name: 'Saquib Sarfaraz',
      username: 'saquib_sarfaraz',
      email: 'saquibsarfaraz47@gmail.com',
      role: 'Campus Mantri',
      teamName: 'Leadership',
      photo: '/assets/leadership/campus-mantri-2024-25.jpg',
      bio: 'Former Campus Mantri at GeeksforGeeks, where I led community initiatives, organized technical events, fostered peer learning, and helped build an engaging coding culture on campus while connecting students with valuable learning and career opportunities.',
      socials: {
        linkedin: 'https://linkedin.com/in/saquib-sarfaraz',
        github: 'https://github.com/saquib-sarfaraz',
        instagram: 'https://instagram.com/saquib.sarfaraz'
      }
    });

    const tanzeelNasim = await ensureMember({
      name: 'Md Tanzeel Nasim',
      username: 'md_tanzeel_nasim',
      email: 'tanzeelnasim21@gmail.com',
      role: 'Community Lead',
      teamName: 'Community',
      photo: '/assets/team/community-lead-tanzeel.jpg',
      bio: "Hello everyone! I'm Md Tanzeel Nasim, It is an honor to serve as the Community Lead of the GeeksforGeeks Campus Body Jamia Hamdard. My vision is to foster a collaborative and innovation-driven community where students can enhance their technical skills, explore emerging technologies, and grow together.",
      socials: {
        instagram: 'https://www.instagram.com/tanzeel.nasim?igsh=ZG13YTlkY2djZnI4',
        linkedin: 'https://www.linkedin.com/in/tanzeel-nasim-a94475382'
      }
    });

    const ridaFatima = await ensureMember({
      name: 'Rida Fatima Tanveer',
      username: 'rida_fatima_tanveer',
      email: 'ridatanveer@gfgcampus.org',
      role: 'Creative Lead',
      teamName: 'Design & Creative',
      photo: '/assets/team/design-lead-rida.jpg',
      bio: "I’m your Creative Lead for GFG, and I’m super excited to create some cool stuff, bring random ideas to life, and make this journey fun with y’all can’t wait to see what we cook up together !!",
      socials: {
        instagram: 'https://www.instagram.com/ridaaaayayaya',
        linkedin: 'https://www.linkedin.com/in/rida-fatima-tanveer-73b7a735a'
      }
    });

    const umraKhan = await ensureMember({
      name: 'Umra Khan',
      username: 'umra_khan',
      email: 'umrakhan1608@gmail.com',
      role: 'Creative Co-Lead',
      teamName: 'Design & Creative',
      photo: '/assets/team/design-colead-umra.jpg',
      bio: "Jack of all trades, master of none… but I like to think that’s just another way of saying versatile. 😌 Excited to step into the role of Creative Co-Lead, create, experiment, learn, and occasionally pretend I know exactly what I’m doing.",
      socials: {
        instagram: 'https://www.instagram.com/umraaaa16'
      }
    });

    const arhamRaza = await ensureMember({
      name: 'Arham Raza',
      username: 'arham_raza',
      email: 'razaarham35@gmail.com',
      role: 'Event & Operations Lead',
      teamName: 'Event & Operation',
      photo: '/assets/team/event-lead-arham.jpg',
      bio: "It is a privilege to serve as the Event & Operations Lead of the GeeksforGeeks Campus Body, Jamia Hamdard. My goal is to help organize engaging events, ensure smooth execution, and create meaningful experiences that inspire learning, collaboration, and innovation.",
      socials: {
        linkedin: 'https://www.linkedin.com/in/arham-raza1',
        instagram: 'https://www.instagram.com/ar_razaa'
      }
    });

    const kashishSafia = await ensureMember({
      name: 'Kashish Safia',
      username: 'kashish_safia',
      email: 'kashishsafia@gfgcampus.org',
      role: 'Event & Operations Co-Lead',
      teamName: 'Event & Operation',
      photo: '/assets/team/event-colead-kashish.jpg',
      bio: "It is a privilege to serve as the Event & Operations Co-Lead of the GeeksforGeeks Campus Body, Jamia Hamdard. My goal is to help organize engaging events, ensure smooth execution, and create meaningful experiences that inspire learning, collaboration, and innovation.",
      socials: {
        linkedin: 'https://www.linkedin.com/in/kashish-safia'
      }
    });

    const tahreerTanweer = await ensureMember({
      name: 'Tahreer Tanweer',
      username: 'tahreer_tanweer',
      email: 'tahreertanweer18@gmail.com',
      role: 'PR & Outreach Lead',
      teamName: 'PR & Outreach',
      photo: '/assets/team/pr-lead-tahreer.jpg',
      bio: "Hey there ✨ It's me your friendly neighborhood PR lead ! Let's connect people, collaborate and grow together. Less boring emails, more unforgettable events 🎉",
      socials: {
        linkedin: 'https://www.linkedin.com/in/tahreer-tanweer-024b13382'
      }
    });

    const khurramRasool = await ensureMember({
      name: 'Khurram Rasool',
      username: 'khurram_rasool',
      email: '1khuurramrasool1@gmail.com',
      role: 'PR & Outreach Co-Lead',
      teamName: 'PR & Outreach',
      photo: '/assets/team/pr-colead-khurram.jpg',
      bio: "I'm honored to serve as the PR & Outreach Co-Lead of the GeeksforGeeks Campus Body, Jamia Hamdard. My aim is to strengthen meaningful connections, build valuable collaborations, and create opportunities that empower students to grow both personally and professionally.",
      socials: {
        instagram: 'https://www.instagram.com/purrrfectly.sus/',
        linkedin: 'https://www.linkedin.com/in/khurram-rasool-144baa1ba',
        github: 'https://github.com/hitherjeWEl'
      }
    });

    const bushraShams = await ensureMember({
      name: 'BUSHRA SHAMS',
      username: 'bushra_shams',
      email: 'bushrashams268@gmail.com',
      role: 'Social Media Lead',
      teamName: 'Social Media',
      photo: '/assets/team/social-lead-bushra.jpg',
      bio: "This community has given me more than just a position, it has given me people, memories, lessons, and a place where I truly feel I belong. Thank you, GfG Jamia Hamdard, for making this journey so special.",
      socials: {
        instagram: 'https://www.instagram.com/bushra_shams__'
      }
    });

    const shaanAhmad = await ensureMember({
      name: 'Shaan Ahmad',
      username: 'shaan_ahmad',
      email: 'officialshaan005@gmail.com',
      role: 'Social Media Co-Lead',
      teamName: 'Social Media',
      photo: '/assets/team/social-colead-shaan.jpg',
      bio: "Hello Everyone! I’m Shaan Ahmed, serving as the Social Media Co-Lead of the GeeksforGeeks Campus Body, Jamia Hamdard. It is a privilege to contribute to a community that encourages learning, innovation, and collaboration.",
      socials: {
        instagram: 'https://www.instagram.__shaan__05'
      }
    });

    const adibaBushra = await ensureMember({
      name: 'Adiba Bushra Khan',
      username: 'adiba_bushra_khan',
      email: 'adibabushrakhan@gmail.com',
      role: 'Technical Lead',
      teamName: 'Technical Team',
      photo: '/assets/team/tech-lead-adiba.jpg',
      bio: "Hi everyone! 👋 I'm Adiba Bushra Khan, your Tech Lead for this tenure at GFG Student Chapter, Jamia Hamdard. Let's build, learn, and level up together. 💚",
      socials: {
        linkedin: 'https://www.linkedin.com/in/adiba-bushra-khan-917a17325/'
      }
    });

    const yussraKhan = await ensureMember({
      name: 'Yussra Khan',
      username: 'yussra_khan',
      email: 'yussrakhan27@gmail.com',
      role: 'Technical Co-Lead',
      teamName: 'Technical Team',
      photo: '/assets/team/tech-colead-yussra.jpg',
      bio: "Hello everyone!! I am Yussra Khan, your co-lead of technical team for this tenure. Lets learn, collaborate and explore technology together here at GFG campus body. Your ideas are always welcomed by our team.",
      socials: {
        instagram: 'https://www.instagram.com/k.yussra'
      }
    });

    // Technical Members
    const techMemberUsernames = [
      'arsalan_ahmad',
      'afaaf_nayyer',
      'mansha_ahmed',
      'riyanshi',
      'wafa_fatima',
      'ariba_tarique'
    ];
    const techMembers = await Member.find({
      communityId: COMMUNITY_ID,
      username: { $in: techMemberUsernames }
    });
    const techMemberIds = techMembers.map(m => m._id);

    // ─── 3. Restore Campus Mantri Records ─────────────────────────────────
    console.log('[Restore] Restoring Campus Mantri sessions...');
    await CampusMantri.deleteMany({ communityId: COMMUNITY_ID });

    await CampusMantri.create([
      {
        communityId: COMMUNITY_ID,
        memberRef: aliRaza._id,
        session: '2025 - 2026',
        startDate: new Date('2025-08-01'),
        about: aliRaza.bio,
        achievements: [
          'Organized Flagship Hackathons & Coding Sprints',
          'Expanded Community to 1,500+ Active Members',
          'Strengthened Core Technical & Domain Teams'
        ],
        isCurrent: true,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        memberRef: saquibSarfaraz._id,
        session: '2024 - 2025',
        startDate: new Date('2024-08-01'),
        about: saquibSarfaraz.bio,
        achievements: [
          'Founded GfG Student Chapter Chapter Ecosystem',
          'Secured National GfG Top 10 Chapter Recognition',
          'Built Official Digital Portal & Community Management Platform'
        ],
        isCurrent: false,
        status: 'Active'
      }
    ]);

    console.log('✓ Campus Mantri records restored (Ali Raza: Current 2025-26, Saquib Sarfaraz: 2024-25).');

    // ─── 4. Restore Teams Structure ───────────────────────────────────────
    console.log('[Restore] Restoring Teams and Leadership hierarchy...');
    await Team.deleteMany({ communityId: COMMUNITY_ID });

    const restoredTeams = [
      {
        communityId: COMMUNITY_ID,
        name: 'Community Lead',
        icon: 'Users',
        description: 'Fosters a collaborative and innovation-driven community where students can enhance their technical skills and grow together.',
        leadRef: tanzeelNasim._id,
        memberRefs: [tanzeelNasim._id],
        displayOrder: 1,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        name: 'Design & Creative',
        icon: 'Palette',
        description: 'Crafts visual identities, graphics, UI mockups, and creative promotional media for all chapter initiatives.',
        leadRef: ridaFatima._id,
        coLeadRef: umraKhan._id,
        memberRefs: [ridaFatima._id, umraKhan._id],
        displayOrder: 2,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        name: 'Event & Operation',
        icon: 'Calendar',
        description: 'Manages event logistics, venue setup, smooth execution, and attendee experiences for workshops and hackathons.',
        leadRef: arhamRaza._id,
        coLeadRef: kashishSafia._id,
        memberRefs: [arhamRaza._id, kashishSafia._id],
        displayOrder: 3,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        name: 'PR & Outreach',
        icon: 'Megaphone',
        description: 'Strengthens meaningful connections, builds industry collaborations, and manages public relations for the chapter.',
        leadRef: tahreerTanweer._id,
        coLeadRef: khurramRasool._id,
        memberRefs: [tahreerTanweer._id, khurramRasool._id],
        displayOrder: 4,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        name: 'Social Media',
        icon: 'Share2',
        description: 'Manages official social channels, creates engaging posts, updates the community, and documents chapter journey.',
        leadRef: bushraShams._id,
        coLeadRef: shaanAhmad._id,
        memberRefs: [bushraShams._id, shaanAhmad._id],
        displayOrder: 5,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        name: 'Technical Team',
        icon: 'Code2',
        description: 'Drives technical workshops, builds open-source applications, conducts bootcamps, and mentors coding enthusiasts.',
        leadRef: adibaBushra._id,
        coLeadRef: yussraKhan._id,
        memberRefs: [adibaBushra._id, yussraKhan._id, ...techMemberIds],
        displayOrder: 6,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        name: 'Media Team',
        icon: 'Camera',
        description: 'Captures photos and videos of chapter events, produces visual content, and documents the campus body journey.',
        memberRefs: [],
        displayOrder: 7,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        name: 'Editorial Team',
        icon: 'PenTool',
        description: 'Writes articles, newsletters, and announcements, and ensures quality and consistency of all published content.',
        memberRefs: [],
        displayOrder: 8,
        status: 'Active'
      },
      {
        communityId: COMMUNITY_ID,
        name: 'Data & Form Team',
        icon: 'Database',
        description: 'Builds registration forms, manages event data, and handles analytics and reporting for chapter initiatives.',
        memberRefs: [],
        displayOrder: 9,
        status: 'Active'
      }
    ];

    await Team.insertMany(restoredTeams);
    console.log('✓ All 9 teams and leadership hierarchy successfully restored in MongoDB.');

    console.log('\n[Restore] SUCCESS! Organizational structure reconnected without touching user accounts.');
    process.exit(0);
  } catch (err) {
    console.error('[Restore Error]:', err);
    process.exit(1);
  }
}

restoreOrgData();
