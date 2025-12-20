import { DEFAULT_TIME_ZONE } from './timezoneUtils';

export const STEPS = [
  {
    id: 'direction',
    label: '第 1 步',
    title: '明确你的学习方向',
    description: '在这一步，我们会帮助你快速对齐目标与期望，明确你需要学习的学科门类。',
  },
  {
    id: 'details',
    label: '第 2 步',
    title: '补充课程细节',
    description: '告诉我们详细的课程类型，以及你期望达成的里程碑。',
  },
  {
    id: 'schedule',
    label: '第 3 步',
    title: '告知时区与可授课时间',
    description: 'MentorX 会根据你的时区和可授课时间，为你匹配最适合的导师。',
  },
  {
    id: 'upload',
    label: '第 4 步',
    title: '很好！这是最后一步',
    description: '你可以预览在导师页面你的个人信息的呈现效果，并在下方上传你的课件。',
  },
];

export const INITIAL_FORM_STATE = {
  learningGoal: '国际课程 / 升学',
  courseDirection: '',
  courseType: '',
  courseTypes: [],
  courseFocus: '',
  format: '线上授课',
  milestone: '',
  totalCourseHours: '',
  availability: DEFAULT_TIME_ZONE,
  sessionDurationHours: 2,
  contactName: '',
  contactMethod: '微信',
  contactValue: '',
  attachments: [],
};

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)] || '';
const MOCK_SCHOOLS = ['斯坦福大学', '清华大学', '麻省理工学院', '北京大学', '多伦多大学', '新加坡国立大学'];
const MOCK_LEVELS = ['本科', '硕士', '博士'];

export const generateMockStudentProfile = () => {
  const id = Math.floor(10 + Math.random() * 90);
  return {
    name: `S${id}`,
    level: pickOne(MOCK_LEVELS),
    school: pickOne(MOCK_SCHOOLS),
  };
};

export const PAGE_TRANSITION_DURATION = 400;
export const PREVIEW_FREEZE_OFFSET = -150;
