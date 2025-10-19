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
  const courses = Array.isArray(data?.courses)
    ? data.courses.join('、')
    : (data?.courses || '');

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

  // 课程方向图标：根据课程名称做关键词匹配，映射到与“学生发布课程需求”一致的图标
  const getCourseIcon = (title) => {
    const s = String(title || '').toLowerCase();
    if (!s) return FaFileAlt;
    const has = (kw) => s.includes(kw);
    if (has('python') || has('编程') || has('program')) return FaCode;
    if (has('数据结构') || has('算法') || has('algorithm')) return FaProjectDiagram;
    if (has('大模型') || has('llm')) return RiAiGenerate;
    if (has('机器学习') || has('深度学习') || has('ml')) return FaRobot;
    if (has('数据分析')) return FaChartBar;
    if (has('高等数学') || has('线性代数') || has('微积分') || has('calculus') || has('linear algebra')) return FaCalculator;
    if (has('概率') || has('统计')) return FaChartPie;
    if (has('物理')) return FaAtom;
    if (has('生命') || has('生物')) return FaDna;
    if (has('化学')) return FaFlask;
    if (has('材料')) return FaCubes;
    if (has('软件') || has('操作系统') || has('数据库') || has('网络') || has('编译')) return FaLaptopCode;
    if (has('安全')) return FaShieldAlt;
    if (has('金融')) return FaDollarSign;
    if (has('会计')) return FaCalculator;
    if (has('经济')) return FaUniversity;
    if (has('营销')) return FaBullhorn;
    if (has('运营')) return FaCogs;
    if (has('项目管理')) return FaTasks;
    if (has('心理')) return FaBrain;
    if (has('设计') || has('创意')) return FaPalette;
    if (has('语言学')) return FaLanguage;
    if (has('传播')) return FaBroadcastTower;
    if (has('法律')) return FaBalanceScale;
    if (has('写作') || has('论文')) return FaFileAlt;
    if (has('求职')) return FaUserTie;
    return FaFileAlt;
  };
  const mainCourse = Array.isArray(data?.courses) ? data.courses[0] : (data?.courses || '');
  const CourseIcon = getCourseIcon(mainCourse);

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
