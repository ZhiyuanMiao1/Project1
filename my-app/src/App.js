import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Register from './components/Register';
import Login from './components/Login';
import './App.css';

// 创建一个 Home 组件，作为默认的主页
function Home() {
    return (
        <div>
            <h1>欢迎来到我的应用!</h1>
            <p>请点击上方链接导航到登录或注册页面。</p>
        </div>
    );
}

function App() {
  return (
    <div className="home-page">
      {/* 顶部导航栏 */}
      <nav className="navbar">
        <div className="logo">Better Network Acceleration</div>
        <ul className="nav-links">
          <li>首页</li>
          <li>产品</li>
          <li>特点</li>
          <li>联系我们</li>
          <li>推广返佣</li>
          <li>
            <div className="user-icon">👤</div>
          </li>
        </ul>
      </nav>

      {/* 中间内容 */}
      <div className="hero-section">
        <h1>Internet Acceleration Service</h1>
        <p>快速体验高速网络！</p>
        <button className="primary-button">查看产品</button>
      </div>
    </div>
  );
}

export default App;

