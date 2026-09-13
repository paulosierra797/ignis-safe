import { useState } from 'react'
import './FAQSection.css'
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy, normalizeDasmarinasText } from '../utils/landingLanguage';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null)
  const { content, language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const currentContent = content.faq[language] || content.faq.english;
  const faqItems = Array.isArray(currentContent.faqs) ? currentContent.faqs : [];
  const splitIndex = Math.ceil(faqItems.length / 2);
  const faqColumns = [faqItems.slice(0, splitIndex), faqItems.slice(splitIndex)];

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="faq" id="faq">
      <div className="faq-container">
        <div className="faq-heading-row">
          <p className="landing-section-eyebrow">{copy.quickAnswers}</p>
          <h2>{normalizeDasmarinasText(currentContent.title)}</h2>
          <p className="faq-intro">{copy.faqDescription}</p>
        </div>

        <div className="faq-list">
          {faqColumns.map((column, columnIndex) => (
            <div className="faq-column" key={columnIndex}>
              {column.map((faq, itemIndex) => {
                const index = columnIndex === 0 ? itemIndex : splitIndex + itemIndex;
                return (
                  <div
                    key={`${index}-${faq.question}`}
                    className={`faq-item ${openIndex === index ? 'open' : ''}`}
                  >
                    <button
                      type="button"
                      className="faq-question"
                      onClick={() => toggleFAQ(index)}
                      aria-expanded={openIndex === index}
                    >
                      <span>{normalizeDasmarinasText(faq.question)}</span>
                      <span className="toggle-icon" aria-hidden="true">{openIndex === index ? '−' : '+'}</span>
                    </button>

                    {openIndex === index && (
                      <div className="faq-answer">
                        {Array.isArray(faq.answer) ? (
                          <ul>
                            {faq.answer.map((item, answerIndex) => (
                              <li key={answerIndex}>{normalizeDasmarinasText(item)}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{normalizeDasmarinasText(faq.answer)}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
