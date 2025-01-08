import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Register from './components/Register';
import Login from './components/Login';
import './App.css';

function App() {
    return (
        <Router>
            <div className="App">
                <header className="App-header">
                    {/* 你可以保留这个 Logo 或移除 */}
                    <p>欢迎来到我的应用!</p>
                </header>
                <Routes>
                    <Route path="/register" element={<Register />} />
                    <Route path="/login" element={<Login />} />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
