import { useState } from 'react'
import './FAQSection.css'
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy, normalizeDasmarinasText } from '../utils/landingLanguage';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null)
  const { content, language, toggleLanguage } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const currentContent = content.faq[language] || content.faq.english;

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="faq" id="faq">
      <div className="faq-container">
        <div className="faq-heading-row">
          <div>
            <p className="landing-section-eyebrow">{copy.quickAnswers}</p>
            <h2>{normalizeDasmarinasText(currentContent.title)}</h2>
          </div>
          <button
            type="button"
            className="language-toggle faq-language-toggle"
            onClick={() => {
              toggleLanguage()
              setOpenIndex(null)
            }}
            aria-label={`Show frequently asked questions in ${copy.alternateLanguageName}`}
          >
            <span aria-hidden="true">文</span>
            {copy.alternateLanguageName}
          </button>
        </div>

        <div className="faq-list">
          {currentContent.faqs.map((faq, index) => (
            <div
              key={index}
              className={`faq-item ${openIndex === index ? 'open' : ''}`}
            >
              <button
                type="button"
                className="faq-question"
                onClick={() => toggleFAQ(index)}
                aria-expanded={openIndex === index}
              >
                <span className="faq-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{normalizeDasmarinasText(faq.question)}</span>
                <span className="toggle-icon" aria-hidden="true">{openIndex === index ? '−' : '+'}</span>
              </button>
              
              {openIndex === index && (
                <div className="faq-answer">
                  {Array.isArray(faq.answer) ? (
                    <ul>
                      {faq.answer.map((item, i) => (
                        <li key={i}>{normalizeDasmarinasText(item)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{normalizeDasmarinasText(faq.answer)}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
