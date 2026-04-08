import './ContactSection.css'
import firestation from '../assets/firestation.jpg'


export default function ContactSection() {
  return (
    <section className="contact" id="contact">
      <div className="contact-container">
        <div className="contact-image">
           <img src={firestation} alt="firestation" className="hero-image-img" />
        </div>
        
        <div className="contact-content">
          <h2>CONTACT INFORMATION</h2>
          
          <div className="emergency-title">
            <h3>EMERGENCY HOTLINE OF BFP:</h3>
            <div className="phone">
              <div className="hotline-row">
                <span className="hotline-icon" aria-hidden="true">&#9742;</span>
                <span className="hotline-label">Landline:</span>
                <a href="tel:0468846131">(046) 884-6131</a>
                <span className="hotline-separator">/</span>
                <a href="tel:0464160875">416-0875</a>
              </div>
              <div className="hotline-row">
                <span className="hotline-icon" aria-hidden="true">&#128241;</span>
                <span className="hotline-label">Mobile:</span>
                <a href="tel:09953369534">0995 336 9534</a>
              </div>
            </div>
          </div>
          
          <div className="contact-info">
            <div className="info-item">
              <label>EMAIL:</label>
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=dasmariasfire@gmail.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                dasmariasfire@gmail.com
              </a>
            </div>
            <div className="info-item">
              <label>FACEBOOK:</label>
              <a href="https://www.facebook.com/GOLF.E207/">BFP-Dasmariñas FS Cavite</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
