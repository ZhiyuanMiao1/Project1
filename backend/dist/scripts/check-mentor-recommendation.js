"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const mentorRecommendation_1 = require("../services/mentorRecommendation");
const now = new Date('2026-04-19T00:00:00.000Z');
const baseMentor = (overrides = {}) => ({
    userId: 1,
    id: 'm1',
    name: 'Mentor',
    displayName: 'Mentor',
    degree: '硕士',
    school: 'Mentory University',
    timezone: 'Asia/Shanghai',
    courses: ['math', 'physics'],
    teachingLanguages: ['zh', 'en'],
    avatarUrl: 'https://example.com/avatar.png',
    rating: 4.8,
    reviewCount: 8,
    avgResponseMinutes: 60,
    mentorCreatedAt: '2026-03-25 00:00:00',
    lastLoginAt: '2026-04-18 00:00:00',
    profileUpdatedAt: '2026-04-17 00:00:00',
    availabilityJson: JSON.stringify({
        timeZone: 'Asia/Shanghai',
        sessionDurationHours: 2,
        daySelections: {
            '2026-04-22': [{ start: 36, end: 44 }],
        },
    }),
    availabilityUpdatedAt: '2026-04-18 00:00:00',
    isAcceptingStudents: 1,
    lastRepliedAt: '2026-04-18 00:00:00',
    completedSessionCount: 6,
    ...overrides,
});
const ranked = (0, mentorRecommendation_1.rankMentorsForRecommendation)([
    baseMentor({
        id: 'm-inactive',
        lastLoginAt: '2025-01-01 00:00:00',
        lastRepliedAt: '2025-01-01 00:00:00',
        profileUpdatedAt: '2025-01-01 00:00:00',
        availabilityUpdatedAt: '2025-01-01 00:00:00',
    }),
    baseMentor({ id: 'm-low-profile', avatarUrl: '', school: '', degree: '', timezone: '', courses: [], teachingLanguages: [] }),
    baseMentor({ id: 'm-empty', name: '', displayName: '', avatarUrl: '', school: '', degree: '', timezone: '', courses: [], teachingLanguages: [] }),
    baseMentor({ id: 'm-new-no-history', userId: 2, rating: 0, reviewCount: 0, completedSessionCount: 0 }),
], now);
assert_1.default.equal(ranked.length, 3, 'only filters mentors with no profile signal');
assert_1.default.ok(ranked.some((mentor) => mentor.id === 'm-inactive'), 'keeps inactive mentors for score downranking');
assert_1.default.ok(ranked.some((mentor) => mentor.id === 'm-low-profile'), 'keeps low-profile mentors for score downranking');
const newMentor = ranked.find((mentor) => mentor.id === 'm-new-no-history');
assert_1.default.ok(newMentor, 'keeps qualified new mentor');
assert_1.default.equal(newMentor?.recommendation.performanceScore, 0.55, 'new mentor gets neutral performance score');
const clustered = (0, mentorRecommendation_1.rankMentorsForRecommendation)([
    baseMentor({ id: 'm-a1', userId: 11, courses: ['ai'], mentorCreatedAt: '2025-01-01 00:00:00' }),
    baseMentor({ id: 'm-a2', userId: 12, courses: ['ai'], rating: 4.79, mentorCreatedAt: '2025-01-01 00:00:00' }),
    baseMentor({ id: 'm-a3', userId: 13, courses: ['ai'], rating: 4.78, mentorCreatedAt: '2025-01-01 00:00:00' }),
    baseMentor({
        id: 'm-b1',
        userId: 14,
        courses: ['biology'],
        rating: 4.3,
        timezone: 'Europe/London',
        teachingLanguages: ['zh'],
        avgResponseMinutes: 600,
        mentorCreatedAt: '2025-01-01 00:00:00',
    }),
], now);
assert_1.default.notDeepEqual(clustered.slice(0, 3).map((mentor) => mentor.primaryCourseKey), ['ai', 'ai', 'ai'], 'light diversification avoids three identical primary courses at the top');
console.log('[check-mentor-recommendation] ok');
