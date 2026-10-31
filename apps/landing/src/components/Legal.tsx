// legal text intentionally supplied by specification; no config data required

export function Privacy() {
  return (
    <main className="section container-x max-w-3xl">
      <h1 className="heading">Privacy Policy</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--c-muted)' }}>Last updated: October 31, 2026</p>
      <div className="prose" style={{ color: 'var(--c-muted)' }}>
        <h2>Who we are</h2>
        <p>Exam Studio is operated by [YOUR FULL NAME / BUSINESS NAME], Rwanda. Contact: wolfras87@gmail.com.</p>
        <h2>What we collect</h2>
        <p>Account data (name, email, hashed password), the notes and files you upload, the study materials you generate, usage data (generation counts, plan, timestamps), and payment status. We do not store card numbers. Card payments are handled by our payment provider, Flutterwave.</p>
        <h2>How we use it</h2>
        <p>To run your account, generate the materials you ask for, enforce plan limits, process payments, prevent abuse, and contact you about your account.</p>
        <h2>AI processing</h2>
        <p>Your notes are sent to [AI PROVIDER NAME] to generate results. We do not use your notes to train models. If you use your own model, your notes go to the provider you configure.</p>
        <h2>Logs</h2>
        <p>We do not write note content to server logs.</p>
        <h2>Sharing</h2>
        <p>We share data only with service providers needed to run Exam Studio (hosting, AI provider, payment provider, email). We do not sell personal data.</p>
        <h2>Retention</h2>
        <p>We keep your data while your account is active. You can delete notes and your account at any time. Deleted data is removed within 30 days, except records we must keep for legal or accounting reasons.</p>
        <h2>Your rights</h2>
        <p>You can access, correct, export or delete your data by emailing wolfras87@gmail.com. You may also contact the Rwandan data protection authority (NCSA).</p>
        <h2>Security</h2>
        <p>Passwords are hashed, traffic uses HTTPS, and access is limited. No system is perfectly secure.</p>
        <h2>Children</h2>
        <p>Exam Studio is not directed at children under 13. Students under 18 should use it with a parent's or teacher's permission.</p>
        <h2>Changes</h2>
        <p>We will post changes here and update the date above.</p>
      </div>
    </main>
  );
}

export function Terms() {
  return (
    <main className="section container-x max-w-3xl">
      <h1 className="heading">Terms of Use</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--c-muted)' }}>Last updated: October 31, 2026</p>
      <div className="prose" style={{ color: 'var(--c-muted)' }}>
        <h2>Acceptance</h2>
        <p>By creating an account or using Exam Studio you agree to these Terms.</p>
        <h2>Your content</h2>
        <p>You own your notes and the materials generated from them. You give us permission to process them only to provide the service. You promise you have the right to upload them and that they do not infringe anyone's rights.</p>
        <h2>Acceptable use</h2>
        <p>No illegal content, no attempts to break or overload the service, no sharing your account, no reselling the service without permission, and no using generated exams for cheating in ways that break your institution's rules.</p>
        <h2>AI output</h2>
        <p>Output may be inaccurate or incomplete. Review it before relying on it or distributing it. You are responsible for the content you generate and use.</p>
        <h2>Plans and limits</h2>
        <p>Each plan has usage limits shown on the pricing page. We may change limits or prices with at least 14 days' notice. Changes do not affect a period you have already paid for.</p>
        <h2>Payments and renewal</h2>
        <p>Paid plans are charged in advance for the chosen month or year. Plans do not renew automatically. You can cancel at any time and access continues until the end of the paid period.</p>
        <h2>Suspension</h2>
        <p>We may suspend accounts that break these Terms or abuse the service.</p>
        <h2>Availability</h2>
        <p>The service is provided "as is". We aim for good uptime but do not guarantee it.</p>
        <h2>Liability</h2>
        <p>To the extent allowed by law, Exam Studio is not liable for indirect or consequential losses, and total liability is limited to the amount you paid in the last 12 months.</p>
        <h2>Governing law</h2>
        <p>These Terms are governed by the laws of Rwanda.</p>
        <h2>Contact</h2>
        <p>wolfras87@gmail.com</p>
      </div>
    </main>
  );
}

export function Refunds() {
  return (
    <main className="section container-x max-w-3xl">
      <h1 className="heading">Refund and Cancellation Policy</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--c-muted)' }}>Last updated: October 31, 2026</p>
      <div className="prose" style={{ color: 'var(--c-muted)' }}>
        <h2>Trial</h2>
        <p>The 7-day trial needs no payment.</p>
        <h2>Refunds</h2>
        <p>If you are not satisfied, email wolfras87@gmail.com within 7 days of your first payment for a full refund, provided you have not used more than 20 generations on the paid plan. Yearly plan renewals are refundable within 3 days of payment.</p>
        <h2>Cancellation</h2>
        <p>Cancel any time from your billing page or by email. You keep access until the end of the period you paid for. We do not give partial refunds for unused time after the refund window.</p>
        <h2>How refunds are paid</h2>
        <p>Refunds go back to the original payment method (card or mobile money) within 5 to 10 business days. For manual MoMo payments, refunds are sent to the number that paid.</p>
        <h2>Failed or duplicate charges</h2>
        <p>Email us with your payment reference and we will fix or refund it.</p>
      </div>
    </main>
  );
}
