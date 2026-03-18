import './AboutSection.css'

export default function AboutSection() {
  return (
    <section className="about" id="about">
      <div className="about-container">
        <h2>About us</h2>
        <p className="about-intro">
          The Dasmariñas Fire Station is committed to protecting lives, safety, and the environment through professional and expertise, emergency medical services, and disaster response. Our dedicated team of firefighters and first responders serve around the clock to ensure the safety of our community. We take pride in serving the public with a unwavering commitment towards emergency response and community service.
        </p>
        
        <div className="values-grid">
          <div className="value-card">
            <h3>Our Mission</h3>
            <p>We commit to prevent and suppress destructive fires, investigate its causes; enforce Fire Code and other related laws; respond to man-made and natural disasters and other emergencies.</p>
          </div>
          <div className="value-card highlight">
            <h3>Our Vision</h3>
            <p>A modern fire service fully capable of ensuring a fire safe nation by 2034.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
