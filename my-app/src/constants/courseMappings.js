// Shared mappings for course directions and course types
// Keep in sync across Mentor cards and Student course request page

import {
  FaCode,
  FaProjectDiagram,
  FaRobot,
  FaChartBar,
  FaChartLine,
  FaCalculator,
  FaChartPie,
  FaAtom,
  FaDna,
  FaFlask,
  FaCubes,
  FaBolt,
  FaWrench,
  FaBuilding,
  FaCloud,
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
  FaHeartbeat,
  FaChalkboardTeacher,
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
  { id: 'business-analytics', label: '商业分析' },
  { id: 'advanced-math', label: '高等数学' },
  { id: 'statistics', label: '概率与统计' },
  { id: 'physics', label: '物理学' },
  { id: 'electrical-electronics', label: '电气与电子' },
  { id: 'mechanical-engineering', label: '机械工程' },
  { id: 'civil-structural', label: '土木 / 结构' },
  { id: 'life-science', label: '生命科学' },
  { id: 'public-health', label: '健康与公共卫生' },
  { id: 'chemistry', label: '化学' },
  { id: 'materials-science', label: '材料科学' },
  { id: 'software-engineering', label: '软件工程' },
  { id: 'cloud-computing', label: '云计算' },
  { id: 'cybersecurity', label: '网络安全' },
  { id: 'finance', label: '金融学' },
  { id: 'accounting', label: '会计学' },
  { id: 'economics', label: '经济学' },
  { id: 'marketing', label: '市场营销' },
  { id: 'management', label: '管理学' },
  { id: 'psychology', label: '心理学' },
  { id: 'education', label: '教育学' },
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
  'business-analytics': FaChartLine,
  'advanced-math': FaCalculator,
  'statistics': FaChartPie,
  'physics': FaAtom,
  'electrical-electronics': FaBolt,
  'mechanical-engineering': FaWrench,
  'civil-structural': FaBuilding,
  'life-science': FaDna,
  'public-health': FaHeartbeat,
  'chemistry': FaFlask,
  'materials-science': FaCubes,
  'software-engineering': FaLaptopCode,
  'cloud-computing': FaCloud,
  'cybersecurity': FaShieldAlt,
  'finance': FaDollarSign,
  'accounting': FaCalculator,
  'economics': FaUniversity,
  'marketing': FaBullhorn,
  'management': FaCogs,
  // legacy ids (merged into 管理学)
  'operations': FaCogs,
  'project-management': FaCogs,
  'psychology': FaBrain,
  'education': FaChalkboardTeacher,
  'design-creative': FaPalette,
  'linguistics': FaLanguage,
  'communication-studies': FaBroadcastTower,
  'law': FaBalanceScale,
  'writing': FaFileAlt,
  'career-coaching': FaUserTie,
  'others': FaEllipsisH,
};

// Helper: id -> label map
const BASE_DIRECTION_ID_TO_LABEL = Object.fromEntries(
  DIRECTION_OPTIONS.map((o) => [o.id, o.label])
);
export const DIRECTION_ID_TO_LABEL = {
  ...BASE_DIRECTION_ID_TO_LABEL,
  // legacy ids (merged into 管理学)
  'operations': BASE_DIRECTION_ID_TO_LABEL.management || '管理学',
  'project-management': BASE_DIRECTION_ID_TO_LABEL.management || '管理学',
};

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
  if (s === '运营管理' || s === '人力资源管理') return '管理学';
  const lower = s.toLowerCase();
  const has = (re) => re.test(s) || re.test(lower);
  if (has(/python|编程/)) return '编程基础';
  if (has(/数据结构|算法/)) return '数据结构与算法';
  if (has(/深度学习|机器学习|ml/)) return '机器学习';
  if (has(/大模型|llm/)) return 'AI 大模型';
  if (has(/数据分析|可视化/)) return '数据分析';
  if (has(/商业分析|商业智能|business\s*(analysis|analytics)|\bbi\b/)) return '商业分析';
  if (has(/高等数学|线性代数|微积分|数理逻辑/)) return '高等数学';
  if (has(/概率|统计/)) return '概率与统计';
  if (has(/物理/)) return '物理学';
  if (has(/电气|电子|电路|信号与系统|嵌入式|electrical|electronics/)) return '电气与电子';
  if (has(/机械|机电|机械工程|热力学|流体力学|mechanical/)) return '机械工程';
  if (has(/土木|结构|建筑|civil|structural/)) return '土木 / 结构';
  if (has(/生命|生物/)) return '生命科学';
  if (has(/健康|公共卫生|流行病|epidemiology|public\s*health|healthcare/)) return '健康与公共卫生';
  if (has(/化学/)) return '化学';
  if (has(/材料/)) return '材料科学';
  if (has(/云计算|云原生|cloud\s*computing|aws|azure|gcp|kubernetes|k8s|docker|devops/)) return '云计算';
  if (has(/操作系统|数据库|网络|软件|工程|编译/)) return '软件工程';
  if (has(/安全/)) return '网络安全';
  if (has(/金融/)) return '金融学';
  if (has(/会计/)) return '会计学';
  if (has(/经济/)) return '经济学';
  if (has(/营销/)) return '市场营销';
  if (has(/管理学|运营|人力资源|\bhr\b|HR|项目管理|project\s*management|operations\s*management/)) return '管理学';
  if (has(/心理/)) return '心理学';
  if (has(/教育学|教育|教学|pedagogy|curriculum|teaching/)) return '教育学';
  if (has(/设计|创意/)) return '设计 / 创意';
  if (has(/语言学/)) return '语言学';
  if (has(/传播/)) return '传播学';
  if (has(/法律/)) return '法律';
  if (has(/写作|论文/)) return '论文写作与润色';
  if (has(/求职/)) return '求职辅导';
  return '其它课程方向';
}
