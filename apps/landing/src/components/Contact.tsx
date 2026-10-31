import { config } from '../config';

export default function Contact() {
  return (
    <section id="contact" className="section container-x">
      <h2 className="heading mb-3">Contact</h2>
      <p className="sub mb-4">Have a question or want to self-host? Reach out.</p>
      <a href={`mailto:${config.links.contact}`} className="btn btn-primary">Email us</a>
    </section>
  );
}
