// Shared mappings for course directions and course types
// Keep in sync across Mentor cards and Student course request page

import {
  FaCode,
  FaProjectDiagram,
  FaRobot,
  FaChartBar,
  FaCalculator,
  FaChartPie,
  FaAtom,
  FaDna,
  FaFlask,
  FaCubes,
  FaLaptopCode,
  FaShieldAlt,
  FaDollarSign,
  FaUniversity,
  FaBullhorn,
  FaCogs,
  FaTasks,
  FaBrain,
  FaPalette,
  FaLanguage,
  FaBroadcastTower,
  FaBalanceScale,
  FaFileAlt,
  FaUserTie,
  FaUsers,
  FaLightbulb,
  FaBookOpen,
  FaCheckCircle,
  FaGraduationCap,
  FaEllipsisH,
} from 'react-icons/fa';
import { RiAiGenerate } from 'react-icons/ri';

// Direction options (course domains)
export const DIRECTION_OPTIONS = [
  { id: 'cs-foundation', label: '编程基础' },
  { id: 'algo', label: '数据结构与算法' },
  { id: 'ml', label: '机器学习' },
  { id: 'ai-large-model', label: 'AI 大模型' },
  { id: 'data-analysis', label: '数据分析' },
  { id: 'advanced-math', label: '高等数学' },
  { id: 'statistics', label: '概率与统计' },
  { id: 'physics', label: '物理学' },
  { id: 'life-science', label: '生命科学' },
  { id: 'chemistry', label: '化学' },
  { id: 'materials-science', label: '材料科学' },
  { id: 'software-engineering', label: '软件工程' },
  { id: 'cybersecurity', label: '网络安全' },
  { id: 'finance', label: '金融学' },
  { id: 'accounting', label: '会计学' },
  { id: 'economics', label: '经济学' },
  { id: 'marketing', label: '市场营销' },
  { id: 'operations', label: '运营管理' },
  { id: 'project-management', label: '人力资源管理' },
  { id: 'psychology', label: '心理学' },
  { id: 'design-creative', label: '设计 / 创意' },
  { id: 'linguistics', label: '语言学' },
  { id: 'communication-studies', label: '传播学' },
  { id: 'law', label: '法律' },
  { id: 'writing', label: '论文写作与润色' },
  { id: 'career-coaching', label: '求职辅导' },
  { id: 'others', label: '其它课程方向' },
];

// Direction icons by id (component form)
export const DIRECTION_ICON_MAP = {
  'cs-foundation': FaCode,
  'algo': FaProjectDiagram,
  'ml': FaRobot,
  'ai-large-model': RiAiGenerate,
  'data-analysis': FaChartBar,
  'advanced-math': FaCalculator,
  'statistics': FaChartPie,
  'physics': FaAtom,
  'life-science': FaDna,
  'chemistry': FaFlask,
  'materials-science': FaCubes,
  'software-engineering': FaLaptopCode,
  'cybersecurity': FaShieldAlt,
  'finance': FaDollarSign,
  'accounting': FaCalculator,
  'economics': FaUniversity,
  'marketing': FaBullhorn,
  'operations': FaCogs,
  'project-management': FaUsers,
  'psychology': FaBrain,
  'design-creative': FaPalette,
  'linguistics': FaLanguage,
  'communication-studies': FaBroadcastTower,
  'law': FaBalanceScale,
  'writing': FaFileAlt,
  'career-coaching': FaUserTie,
  'others': FaEllipsisH,
};

// Helper: id -> label map
export const DIRECTION_ID_TO_LABEL = Object.fromEntries(
  DIRECTION_OPTIONS.map((o) => [o.id, o.label])
);

// Mapping by label (component form)
export const DIRECTION_LABEL_ICON_MAP = Object.fromEntries(
  DIRECTION_OPTIONS.map((o) => [o.label, DIRECTION_ICON_MAP[o.id] || FaEllipsisH])
);

// ——— Course Type (second-level type like pre-study/final-review) ——— //
export const COURSE_TYPE_OPTIONS = [
  { id: 'course-selection', label: '选课指导' },
  { id: 'pre-study', label: '课前预习' },
  { id: 'assignment-project', label: '作业项目' },
  { id: 'final-review', label: '期末复习' },
  { id: 'in-class-support', label: '毕业论文' },
  { id: 'others', label: '其它类型' },
];

export const COURSE_TYPE_ICON_MAP = {
  'course-selection': FaLightbulb,
  'pre-study': FaBookOpen,
  'assignment-project': FaTasks,
  'final-review': FaCheckCircle,
  'in-class-support': FaGraduationCap,
  'others': FaEllipsisH,
};

export const COURSE_TYPE_ID_TO_LABEL = Object.fromEntries(
  COURSE_TYPE_OPTIONS.map((o) => [o.id, o.label])
);

export const COURSE_TYPE_LABEL_ICON_MAP = Object.fromEntries(
  COURSE_TYPE_OPTIONS.map((o) => [o.label, COURSE_TYPE_ICON_MAP[o.id]])
);

// Legacy English -> Chinese label mapping for course type selections
// Used by navbar filters to display Chinese while keeping internal values unchanged
export const COURSE_TYPE_EN_TO_CN = {
  'Course Selection': '选课指导',
  'Pre-class Preparation': '课前预习',
  'Assignment': '作业项目',
  'Exam Review': '期末复习',
  'Graduation Thesis': '毕业论文',
  'Programming': '其它类型',
};

export function courseTypeToCnLabel(value) {
  const raw = value || '';
  if (COURSE_TYPE_ID_TO_LABEL[raw]) return COURSE_TYPE_ID_TO_LABEL[raw];
  return COURSE_TYPE_EN_TO_CN[raw] || raw || '';
}

// Normalize free-text course titles to a standard label used above
export function normalizeCourseLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (DIRECTION_ID_TO_LABEL[s]) return DIRECTION_ID_TO_LABEL[s];
  if (DIRECTION_LABEL_ICON_MAP[s]) return s;
  const lower = s.toLowerCase();
  const has = (re) => re.test(s) || re.test(lower);
  if (has(/python|编程/)) return '编程基础';
  if (has(/数据结构|算法/)) return '数据结构与算法';
  if (has(/深度学习|机器学习|ml/)) return '机器学习';
  if (has(/大模型|llm/)) return 'AI 大模型';
  if (has(/数据分析|可视化/)) return '数据分析';
  if (has(/高等数学|线性代数|微积分|数理逻辑/)) return '高等数学';
  if (has(/概率|统计/)) return '概率与统计';
  if (has(/物理/)) return '物理学';
  if (has(/生命|生物/)) return '生命科学';
  if (has(/化学/)) return '化学';
  if (has(/材料/)) return '材料科学';
  if (has(/操作系统|数据库|网络|软件|工程|编译/)) return '软件工程';
  if (has(/安全/)) return '网络安全';
  if (has(/金融/)) return '金融学';
  if (has(/会计/)) return '会计学';
  if (has(/经济/)) return '经济学';
  if (has(/营销/)) return '市场营销';
  if (has(/运营/)) return '运营管理';
  if (has(/人力资源|\bhr\b|HR|项目管理/)) return '人力资源管理';
  if (has(/心理/)) return '心理学';
  if (has(/设计|创意/)) return '设计 / 创意';
  if (has(/语言学/)) return '语言学';
  if (has(/传播/)) return '传播学';
  if (has(/法律/)) return '法律';
  if (has(/写作|论文/)) return '论文写作与润色';
  if (has(/求职/)) return '求职辅导';
  return '其它课程方向';
}
