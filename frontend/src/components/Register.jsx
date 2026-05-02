import React, { useState } from "react";
import { Link } from "react-router-dom";

function Register() {
  const [regNumber, setRegNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault(); // Prevents the page from refreshing
    try {
      // This sends the data to your Node.js backend!
      const response = await fetch("http://localhost:5000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_number: regNumber,
          email: email,
          password: password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("Registration successful! You can now log in.");
      } else {
        setMessage(data.message); // Shows error from backend
      }
    } catch (error) {
      setMessage("Error connecting to server.");
    }
  };

  return (
    <div className="container">
      <div className="form-box">
        <h2>Student Registration</h2>
        {message && (
          <p className={message.includes("successful") ? "success" : "error"}>
            {message}
          </p>
        )}

        <form
          onSubmit={handleRegister}
          style={{ display: "flex", flexDirection: "column" }}
        >
          <input
            type="text"
            placeholder="Registration Number (e.g. SIT/B/...)"
            value={regNumber}
            onChange={(e) => setRegNumber(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Student Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Register</button>
        </form>
        <p style={{ marginTop: "15px", fontSize: "14px" }}>
          Already registered? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
