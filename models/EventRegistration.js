const mongoose = require('mongoose');

const memberSubSchema = new mongoose.Schema({
  memberIndex: { type: Number, required: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  mobile: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true }
}, { _id: false });

const eventRegistrationSchema = new mongoose.Schema({
  registrationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  communityId: {
    type: String,
    default: 'gfg-jamia-hamdard',
    index: true
  },
  eventName: {
    type: String,
    default: 'THINKTANK IDEATHON 2026'
  },
  teamName: {
    type: String,
    required: [true, 'Team Name is required'],
    trim: true
  },
  teamSize: {
    type: Number,
    required: [true, 'Team Size is required'],
    min: 3,
    max: 6
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Technical Track', 'Non-Technical Track']
  },
  facultyMentor: {
    type: String,
    required: [true, 'Faculty Mentor Name is required'],
    trim: true
  },
  leader: {
    name: { type: String, required: [true, 'Leader Name is required'], trim: true },
    email: { type: String, required: [true, 'Leader Email is required'], trim: true, lowercase: true },
    mobile: { type: String, required: [true, 'Leader Mobile is required'], trim: true },
    department: { type: String, required: [true, 'Leader Department is required'], trim: true }
  },
  members: [memberSubSchema],
  status: {
    type: String,
    enum: ['Confirmed', 'Pending Verification', 'Waitlisted', 'Cancelled'],
    default: 'Confirmed'
  }
}, { timestamps: true });

module.exports = mongoose.model('EventRegistration', eventRegistrationSchema);
