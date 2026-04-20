import './Header.css'
import logo from '../assets/bfp_dasma.png'
import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
           <img src={logo} alt="Logo" className="logo-icon" />
          <div className="logo-text">
            <h4>BUREAU OF FIRE PROTECTION</h4>
            <h4>DASMARIÑAS CITY FIRE STATION</h4>
          </div>
        </div>
        <nav className="nav">
          <a href="#home">Home</a>
          <a href="#announcements">Announcements</a>
          <a href="#about">About</a>
          <a href="#contact">Contact Us</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Link to="/login">
          <button className="login-btn">Login</button>
        </Link>
      </div>
    </header>
  )
}
