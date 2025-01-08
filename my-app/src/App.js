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
      <Router>
          <div className="App">
              <header className="App-header">
                  <p>欢迎来到我的应用!</p>
                  <nav>
                      <Link to="/">主页</Link> |{' '}
                      <Link to="/register">注册</Link> |{' '}
                      <Link to="/login">登录</Link>
                  </nav>
              </header>
              <div className="App-content">
                  <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/register" element={<Register />} />
                      <Route path="/login" element={<Login />} />
                  </Routes>
              </div>
          </div>
      </Router>
  );
}


export default App;
