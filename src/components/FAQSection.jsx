import { useState } from 'react'
import './FAQSection.css'
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy, normalizeDasmarinasText } from '../utils/landingLanguage';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null)
  const { content, language } = useLandingContent();
  const copy = { ...getLandingUiCopy(language), ...(content.copy?.[language] || {}) };
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
          <p className="landing-section-eyebrow" data-landing-edit-path={`copy.${language}.quickAnswers`} data-landing-edit-label="FAQ section eyebrow">{copy.quickAnswers}</p>
          <h2 data-landing-edit-path={`faq.${language}.title`} data-landing-edit-label="FAQ section heading">{normalizeDasmarinasText(currentContent.title)}</h2>
          <p className="faq-intro" data-landing-edit-path={`copy.${language}.faqDescription`} data-landing-edit-label="FAQ section description" data-landing-edit-multiline="true">{copy.faqDescription}</p>
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
                      <span data-landing-edit-path={`faq.${language}.faqs.${index}.question`} data-landing-edit-label={`FAQ question ${index + 1}`}>{normalizeDasmarinasText(faq.question)}</span>
                      <span className="toggle-icon" aria-hidden="true">{openIndex === index ? '−' : '+'}</span>
                    </button>

                    <div
                      className="faq-answer"
                      hidden={openIndex !== index}
                      data-landing-edit-path={`faq.${language}.faqs.${index}.answer`}
                      data-landing-edit-label={`FAQ answer ${index + 1}`}
                      data-landing-edit-lines="true"
                    >
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
