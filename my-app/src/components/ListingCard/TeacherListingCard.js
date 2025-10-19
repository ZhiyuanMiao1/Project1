import React, { useState } from 'react';
import './TeacherListingCard.css';
import useRevealOnScroll from '../../hooks/useRevealOnScroll';
import {
  FaHeart,
  FaGlobe,
  FaFileAlt,
  FaGraduationCap,
  FaClock,
  FaCalendarAlt,
  FaLightbulb,
  FaTasks,
  FaEllipsisH,
  FaBookOpen,
  FaCheckCircle,
  // 课程方向图标（与学生发布课程页面一致）
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
  FaBrain,
  FaPalette,
  FaLanguage,
  FaBroadcastTower,
  FaBalanceScale,
  FaUserTie,
} from 'react-icons/fa';
import { RiAiGenerate } from 'react-icons/ri';

function TeacherListingCard({ data }) {
  // 收藏状态
  const [isFavorited, setIsFavorited] = useState(false);
  const { ref: revealRef, visible } = useRevealOnScroll();

  const toggleFavorite = () => setIsFavorited((v) => !v);

  const name = `Student${data?.id ?? ''}`;
  const degree = data?.degree || '';
  const school = data?.school || '';
  // —— 课程方向：将原始课程名规范为学生发布页中的标准标签，并按标签选择图标 —— //
  const DIRECTION_LABEL_ICON_MAP = {
    '编程基础': FaCode,
    '数据结构与算法': FaProjectDiagram,
    '机器学习': FaRobot,
    'AI 大模型': RiAiGenerate,
    '数据分析': FaChartBar,
    '高等数学': FaCalculator,
    '概率与统计': FaChartPie,
    '物理学': FaAtom,
    '生命科学': FaDna,
    '化学': FaFlask,
    '材料科学': FaCubes,
    '软件工程': FaLaptopCode,
    '网络安全': FaShieldAlt,
    '金融学': FaDollarSign,
    '会计学': FaCalculator,
    '经济学': FaUniversity,
    '市场营销': FaBullhorn,
    '运营管理': FaCogs,
    '项目管理': FaTasks,
    '心理学': FaBrain,
    '设计 / 创意': FaPalette,
    '语言学': FaLanguage,
    '传播学': FaBroadcastTower,
    '法律': FaBalanceScale,
    '论文写作与润色': FaFileAlt,
    '求职辅导': FaUserTie,
    '其它课程方向': FaEllipsisH,
  };

  const normalizeCourseLabel = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    // 若已是标准标签，直接返回
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
    if (has(/项目管理/)) return '项目管理';
    if (has(/心理/)) return '心理学';
    if (has(/设计|创意/)) return '设计 / 创意';
    if (has(/语言学/)) return '语言学';
    if (has(/传播/)) return '传播学';
    if (has(/法律/)) return '法律';
    if (has(/写作|论文/)) return '论文写作与润色';
    if (has(/求职/)) return '求职辅导';
    return '其它课程方向';
  };

  const courseTitles = Array.isArray(data?.courses)
    ? data.courses
    : (data?.courses ? [data.courses] : []);
  const normalizedLabels = Array.from(new Set(courseTitles.map(normalizeCourseLabel).filter(Boolean)));
  const courses = normalizedLabels.join('、');
  const CourseIcon = DIRECTION_LABEL_ICON_MAP[normalizedLabels[0]] || FaFileAlt;

  // 课程类型到图标的映射（与“学生发布课程需求”页面保持一致）
  const COURSE_TYPE_ICON_MAP = {
    '选课指导': FaLightbulb,
    '课前预习': FaBookOpen,
    '作业项目': FaTasks,
    '期末复习': FaCheckCircle,
    '毕业论文': FaGraduationCap,
    '其它类型': FaEllipsisH,
  };
  const CourseTypeIcon = COURSE_TYPE_ICON_MAP[data?.courseType] || FaGraduationCap;

  // 课程类型（第三行）映射保持不变

  return (
    // 保持原有 .listing-card 尺寸规则，同时套用预览卡的视觉风格
    <div ref={revealRef} className={`listing-card teacher-preview-card reveal ${visible ? 'is-visible' : ''}`}>
      <button
        type="button"
        aria-label={isFavorited ? '取消收藏' : '收藏'}
        className={`card-fav ${isFavorited ? 'favorited' : ''}`}
        onClick={toggleFavorite}
      >
        <FaHeart />
      </button>

      <div className="card-header">
        <div className="avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase() || 'S'}
        </div>
        <div className="header-texts">
          <div className="name">{name}</div>
          <div className="chips">
            {!!degree && <span className="chip green">{degree}</span>}
            {!!school && <span className="chip gray">{school}</span>}
          </div>
        </div>
      </div>

      <div className="card-list" role="list">
        {!!data?.timezone && (
          <div className="item" role="listitem">
            <span className="icon"><FaGlobe /></span>
            <span>{data.timezone}</span>
          </div>
        )}
        {!!courses && (
          <div className="item" role="listitem">
            <span className="icon"><CourseIcon /></span>
            <span>{courses}</span>
          </div>
        )}
        {!!data?.courseType && (
          <div className="item" role="listitem">
            <span className="icon"><CourseTypeIcon /></span>
            <span>{data.courseType}</span>
          </div>
        )}
        {!!data?.expectedDuration && (
          <div className="item" role="listitem">
            <span className="icon"><FaClock /></span>
            <span>{data.expectedDuration}</span>
          </div>
        )}
        {/* 根据产品需求：教师卡片仅保留前四行 + 最后一行，
            因此移除“具体内容”和“学习目标”两项 */}
        {!!data?.expectedTime && (
          <div className="item" role="listitem">
            <span className="icon"><FaCalendarAlt /></span>
            <span>{data.expectedTime}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherListingCard;
