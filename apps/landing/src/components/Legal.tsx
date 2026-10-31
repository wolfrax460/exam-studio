import { config } from '../config';

export function Privacy() {
  return <section id="privacy" className="section container-x">
    <h2 className="heading mb-3">{config.privacy.title}</h2>
    <p className="sub">{config.privacy.body}</p>
  </section>;
}

export function Terms() {
  return <section id="terms" className="section container-x">
    <h2 className="heading mb-3">{config.terms.title}</h2>
    <p className="sub">{config.terms.body}</p>
  </section>;
}
