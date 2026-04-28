import './HeroSection.css'
import bfppic from '../assets/bfp_pic.jpg'
import { useLandingContent } from '../context/LandingContentContext';

export default function HeroSection() {
  const { content } = useLandingContent();

  return (
    <section className="hero" id="home">
      <div className="hero-container">
        <div className="hero-content">
          <h1>{content.hero.title}</h1>
          <p>
            <span className="hero-lead">{content.hero.lead}</span>
            {content.hero.description}
          </p>
        </div>
        <div className="hero-image">
          <img src={bfppic} alt="BFP Picture" className="hero-image-img" />
        </div>
      </div>
    </section>
  )
}
