import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import { fetchApprovedMentors } from '../../api/mentors';
import StudentListingCard from '../../components/ListingCard/StudentListingCard';
import { getAuthToken } from '../../utils/authStorage';
import './MentorDetailPage.css';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;

const hashString = (input) => {
  const text = String(input ?? '');
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeNumber = (value, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

const formatReviewCount = (value) => {
  const n = Number.parseInt(String(value ?? '0'), 10);
  if (!Number.isFinite(n) || n <= 0) return '暂无评价';
  return `${n} 条评价`;
};

const buildMockReviewSummary = ({ seedKey, rating, reviewCount }) => {
  const rng = mulberry32(hashString(seedKey));
  const base = clamp(rating > 0 ? rating : 4.8, 1, 5);
  const count = Number.isFinite(reviewCount) && reviewCount > 0 ? reviewCount : 0;

  const categories = [
    '讲解清晰',
    '专业度',
    '沟通顺畅',
    '备课充分',
    '守时',
    '性价比',
  ].map((label) => ({
    label,
    score: round1(clamp(base + (rng() - 0.5) * 0.4, 0, 5)),
  }));

  const distribution = (() => {
    if (!count) return null;
    const mean = clamp(base, 1, 5);
    const w5 = clamp(0.55 + (mean - 4.5) * 0.7, 0.12, 0.88);
    const w4 = clamp(0.28 - (mean - 4.5) * 0.35, 0.06, 0.6);
    const w3 = clamp(0.12 - (mean - 4.5) * 0.2, 0.02, 0.25);
    const w2 = clamp(0.03 + (4.2 - mean) * 0.02, 0.01, 0.12);
    const w1 = clamp(0.02 + (4.1 - mean) * 0.02, 0.01, 0.12);
    const weightsRaw = [w5, w4, w3, w2, w1];
    const sum = weightsRaw.reduce((acc, x) => acc + x, 0) || 1;
    const weights = weightsRaw.map((x) => x / sum);
    const expected = weights.map((w) => w * count);
    const counts = expected.map((x) => Math.floor(x));
    let remaining = count - counts.reduce((acc, x) => acc + x, 0);
    const order = [...Array(expected.length).keys()].sort((a, b) => expected[b] - expected[a]);
    let idx = 0;
    while (remaining > 0) {
      counts[order[idx % order.length]] += 1;
      remaining -= 1;
      idx += 1;
    }
    return [
      { stars: 5, count: counts[0] },
      { stars: 4, count: counts[1] },
      { stars: 3, count: counts[2] },
      { stars: 2, count: counts[3] },
      { stars: 1, count: counts[4] },
    ];
  })();

  const reviews = (() => {
    const templates = [
      '讲解非常清晰，会结合题目拆解思路，课后也会给到改进建议。',
      '沟通顺畅，安排灵活，能快速定位我的薄弱点并提供练习方案。',
      '很有耐心，解释到我完全理解为止，节奏把控得很好。',
      '专业度很强，给到的学习路径很具体，效率提升明显。',
      '反馈及时，代码走查细致，指出了很多容易忽略的问题。',
    ];
    const names = ['Yoriko', 'Andrea', 'S12', 'S08', 'S19', 'S03'];
    const times = ['4 天前', '2 周前', '1 个月前', '3 天前', '5 天前'];
    const take = Math.max(2, Math.min(4, Math.round(2 + rng() * 2)));
    return Array.from({ length: take }).map((_, i) => {
      const score = round1(clamp(base + (rng() - 0.5) * 0.6, 1, 5));
      return {
        id: `${seedKey}-review-${i}`,
        author: names[Math.floor(rng() * names.length)],
        time: times[Math.floor(rng() * times.length)],
        rating: score,
        content: templates[Math.floor(rng() * templates.length)],
      };
    });
  })();

  return { categories, distribution, reviews };
};

function MentorDetailPage() {
  const menuAnchorRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const mentorId = safeDecode(typeof params?.mentorId === 'string' ? params.mentorId : '');

  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });

  const [mentor, setMentor] = useState(() => location?.state?.mentor || null);
  const [loading, setLoading] = useState(() => !location?.state?.mentor);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handler = (event) => {
      if (typeof event?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!event.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    const onStorage = (ev) => {
      if (ev.key === 'authToken') setIsLoggedIn(!!(ev.newValue || getAuthToken()));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:changed', handler);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const fromState = location?.state?.mentor;
    if (fromState && String(fromState?.id) === mentorId) {
      setMentor(fromState);
      setLoading(false);
      setErrorMessage('');
      return () => {
        alive = false;
      };
    }

    if (!mentorId) {
      setMentor(null);
      setLoading(false);
      setErrorMessage('缺少 MentorID');
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    setErrorMessage('');

    fetchApprovedMentors()
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.data?.mentors) ? res.data.mentors : [];
        const hit = list.find((m) => String(m?.id) === mentorId) || null;
        if (!hit) {
          setMentor(null);
          setErrorMessage('未找到该导师');
          return;
        }
        setMentor(hit);
      })
      .catch((e) => {
        if (!alive) return;
        const msg = e?.response?.data?.error || e?.message || '加载失败，请稍后再试';
        setMentor(null);
        setErrorMessage(String(msg));
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [location?.state?.mentor, mentorId]);

  const ratingValue = normalizeNumber(mentor?.rating, 0);
  const reviewCount = Number.parseInt(String(mentor?.reviewCount ?? 0), 10) || 0;
  const summary = useMemo(() => {
    const seedKey = mentor?.id || mentorId || 'mentor';
    return buildMockReviewSummary({ seedKey, rating: ratingValue, reviewCount });
  }, [mentor?.id, mentorId, ratingValue, reviewCount]);

  const previewCardData = useMemo(() => {
    const courses = Array.isArray(mentor?.courses)
      ? mentor.courses
      : (typeof mentor?.courses === 'string'
        ? mentor.courses.split(/[,，]/g).map((x) => x.trim()).filter(Boolean)
        : []);

    return {
      name: mentor?.name || '导师',
      gender: mentor?.gender || '',
      degree: mentor?.degree || '',
      school: (mentor?.school || '').trim(),
      rating: ratingValue,
      reviewCount,
      timezone: mentor?.timezone || '',
      languages: mentor?.languages || '',
      courses,
      imageUrl: mentor?.imageUrl || mentor?.avatarUrl || null,
    };
  }, [mentor, ratingValue, reviewCount]);

  const handleBook = () => {
    if (!mentor) return;
    if (!isLoggedIn) {
      setShowStudentAuth(true);
      return;
    }
    navigate('/student/course-request', { state: { mentorId: mentor?.id || mentorId, mentor } });
  };

  return (
    <div className="mentor-detail-page">
      <div className="container">
        <header className="mentor-detail-header">
          <BrandMark className="nav-logo-text" to="/student" />
          <button
            type="button"
            className="icon-circle mentor-detail-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => setShowStudentAuth(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <main className="mentor-detail-content">
          {loading ? (
            <div className="mentor-detail-loading" aria-live="polite">加载中…</div>
          ) : errorMessage ? (
            <div className="mentor-detail-error" role="alert">{errorMessage}</div>
          ) : mentor ? (
            <>
              <section className="mentor-detail-top" aria-label="导师信息与预约">
                <div className="mentor-detail-preview" aria-label="导师预览卡片">
                  <div className="preview-wrap">
                    <StudentListingCard data={previewCardData} />
                  </div>
                </div>
                <aside className="mentor-detail-booking" aria-label="预约上课">
                  <div className="mentor-booking-card">
                    <div className="mentor-booking-title">预约上课</div>
                    <div className="mentor-booking-subtitle">选择时间，提交学习需求，由导师与你确认</div>
                    <button
                      type="button"
                      className="mentor-booking-button"
                      onClick={handleBook}
                    >预约这个导师</button>
                    {!isLoggedIn ? (
                      <div className="mentor-booking-hint">需要先登录学生账号</div>
                    ) : (
                      <div className="mentor-booking-hint">提交后可在“我的课程”查看进度</div>
                    )}
                  </div>
                </aside>
              </section>

              <section className="mentor-rating-card" aria-label="评分与评价">
                <div className="mentor-rating-top">
                  <div className="mentor-rating-number">{ratingValue > 0 ? ratingValue.toFixed(2) : '—'}</div>
                  <div className="mentor-rating-title">学员推荐</div>
                  <div className="mentor-rating-subtitle">{reviewCount > 0 ? `基于 ${reviewCount} 条评价` : '暂无评价数据'}</div>
                </div>

                <div className="mentor-rating-grid">
                  <div className="mentor-rating-distribution" aria-label="评分分布">
                    {summary.distribution ? (
                      summary.distribution.map((row) => {
                        const pct = reviewCount > 0 ? row.count / reviewCount : 0;
                        return (
                          <div className="dist-row" key={`dist-${row.stars}`}>
                            <span className="dist-label">{row.stars}</span>
                            <div className="dist-bar" aria-hidden="true">
                              <div className="dist-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
                            </div>
                            <span className="dist-count">{row.count}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="dist-empty">暂无分布</div>
                    )}
                  </div>

                  <div className="mentor-rating-categories" aria-label="评分维度">
                    {summary.categories.map((item) => (
                      <div className="cat-item" key={`cat-${item.label}`}>
                        <div className="cat-label">{item.label}</div>
                        <div className="cat-score">{item.score.toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="mentor-reviews" aria-label="学员评价列表">
                <div className="mentor-reviews-head">
                  <h2 className="mentor-reviews-title">评价</h2>
                  <div className="mentor-reviews-count">{formatReviewCount(reviewCount)}</div>
                </div>

                <div className="mentor-reviews-grid">
                  {summary.reviews.map((review) => (
                    <article className="mentor-review-card" key={review.id}>
                      <div className="review-head">
                        <div className="review-avatar" aria-hidden="true">
                          {String(review.author || 'S').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="review-meta">
                          <div className="review-author">{review.author}</div>
                          <div className="review-sub">
                            <span className="review-rating">{review.rating.toFixed(1)}</span>
                            <span className="review-dot">·</span>
                            <span className="review-time">{review.time}</span>
                          </div>
                        </div>
                      </div>
                      <p className="review-content">{review.content}</p>
                    </article>
                  ))}
                </div>

                <button type="button" className="mentor-reviews-more">显示更多</button>
              </section>
            </>
          ) : null}
        </main>
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}
    </div>
  );
}

export default MentorDetailPage;
