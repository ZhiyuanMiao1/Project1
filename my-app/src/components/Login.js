import React, { useState } from 'react';
import axios from 'axios';

function Login() {
    const [formData, setFormData] = useState({ email: '', password: '' });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('/api/login', formData);
            alert('登录成功！');
            localStorage.setItem('token', response.data.token);
        } catch (error) {
            alert(error.response.data.error || '登录失败');
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <input type="email" name="email" placeholder="邮箱" onChange={handleChange} required />
            <input type="password" name="password" placeholder="密码" onChange={handleChange} required />
            <button type="submit">登录</button>
        </form>
    );
}

export default Login;
