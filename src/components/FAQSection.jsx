import { useState } from 'react'
import './FAQSection.css'
import { useLandingContent } from '../context/LandingContentContext';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null)
  const [isTagalog, setIsTagalog] = useState(false)
  const { content } = useLandingContent();
  const currentContent = isTagalog ? content.faq.tagalog : content.faq.english

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="faq" id="faq">
      <div className="faq-container">
        <h2>{currentContent.title}</h2>
        <button 
          className="tagalog-btn"
          onClick={() => setIsTagalog(!isTagalog)}
        >
          {isTagalog ? 'ENGLISH' : 'TAGALOG'}
        </button>

        <div className="faq-list">
          {currentContent.faqs.map((faq, index) => (
            <div
              key={index}
              className={`faq-item ${openIndex === index ? 'open' : ''}`}
            >
              <button
                className="faq-question"
                onClick={() => toggleFAQ(index)}
              >
                <span className="faq-number">0{index + 1}</span>
                <span>{faq.question}</span>
                <span className="toggle-icon">{openIndex === index ? '−' : '+'}</span>
              </button>
              
              {openIndex === index && (
                <div className="faq-answer">
                  {Array.isArray(faq.answer) ? (
                    <ul>
                      {faq.answer.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{faq.answer}</p>
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
