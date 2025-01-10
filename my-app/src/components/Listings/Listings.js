import React from 'react';
import ListingCard from '../ListingCard/ListingCard';
import './Listings.css';

function Listings() {
  // 模拟一些房源数据
  const listingData = [
    {
      id: 1,
      title: '美国 加利福尼亚州 杭廷顿海滩',
      rating: 5.0,
      price: '$8,397',
      imageUrl: 'https://via.placeholder.com/400x300/DDD/000?text=Listing+1',
      desc: '沙滩和山景观 | 5 晚 | “房源比房源照片更令人惊叹”'
    },
    {
      id: 2,
      title: '美国 加利福尼亚州 马里布',
      rating: 4.97,
      price: '$3,780',
      imageUrl: 'https://via.placeholder.com/400x300/CCC/000?text=Listing+2',
      desc: '沙滩和山景观 | 5 晚 | “房子配备了我们所需的一切”'
    },
    {
      id: 3,
      title: '美国 加利福尼亚州 曼哈顿海滩',
      rating: 4.79,
      price: '$3,623',
      imageUrl: 'https://via.placeholder.com/400x300/BBB/000?text=Listing+3',
      desc: '沙滩景观 | 5 晚 | 近海高分好评'
    },
    {
      id: 4,
      title: '美国 加利福尼亚州 马里布',
      rating: 4.98,
      price: '$12,438',
      imageUrl: 'https://via.placeholder.com/400x300/AAA/000?text=Listing+4',
      desc: '距离你 23 英里 | 5 晚 | “房子很擅长沟通，总是立即回复”'
    },
  ];

  return (
    <div className="listings container">
      {/* 标题示例 */}
      <h2>房源推荐</h2>
      <div className="listing-grid">
        {listingData.map((item) => (
          <ListingCard key={item.id} data={item} />
        ))}
      </div>
    </div>
  );
}

export default Listings;
