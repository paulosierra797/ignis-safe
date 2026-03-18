import './HeroSection.css'
import bfppic from '../assets/bfp_pic.jpg'

export default function HeroSection() {
  return (
    <section className="hero" id="home">
      <div className="hero-container">
        <div className="hero-content">
          <h1>Protecting lives, property, and community.</h1>
          <p>
            <span className="hero-lead">Welcome to our Dasmariñas Fire Station portal.</span>
            Learn about our services, contact details and FSIC & FSEC organization for safety, preparedness, and community support.
          </p>
        </div>
        <div className="hero-image">
          <img src={bfppic} alt="BFP Picture" className="hero-image-img" />
        </div>
      </div>
    </section>
  )
}
