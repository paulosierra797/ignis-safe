import VisitorChat from './VisitorChat';
import './SendMessageSection.css';

export default function SendMessageSection() {
  return (
    <section className="send-message-page" id="send-message">
      <div className="send-message-page-heading">
        <p className="landing-section-eyebrow">Direct website messaging</p>
        <h2>Talk With Our Team</h2>
        <p>
          Ask any question and continue the conversation here. Your name and email help our administrators identify and respond to you.
        </p>
      </div>
      <VisitorChat variant="full" active />
    </section>
  );
}
