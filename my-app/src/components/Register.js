import React, { useState } from 'react';
import axios from 'axios';

function Register() {
    const [formData, setFormData] = useState({ username: '', email: '', password: '', role: 'student' });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('/api/register', formData);
            alert(response.data.message);
        } catch (error) {
            alert(error.response.data.error || '注册失败');
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <input type="text" name="username" placeholder="用户名" onChange={handleChange} required />
            <input type="email" name="email" placeholder="邮箱" onChange={handleChange} required />
            <input type="password" name="password" placeholder="密码" onChange={handleChange} required />
            <select name="role" onChange={handleChange}>
                <option value="student">学生</option>
                <option value="teacher">教师</option>
            </select>
            <button type="submit">注册</button>
        </form>
    );
}

export default Register;
