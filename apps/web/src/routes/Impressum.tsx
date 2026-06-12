import { Link } from "react-router-dom";
// toolr-design-ignore-next-line
import { ArrowLeft } from "lucide-react";

export function Impressum() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-subtext hover:text-text transition-colors text-sm mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h1 className="text-lg font-bold text-text mb-6">Imprint</h1>

      <div className="prose prose-invert max-w-none space-y-4">
        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Site Operator
          </h2>
          <p className="text-subtext">
            Daniel Deusing<br />
            Rosenbergstr. 32<br />
            56579 Hardert, Germany
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Contact</h2>
          <p className="text-subtext">
            Phone: +49 151 16545891<br />
            Email:{" "}
            <a
              href="mailto:info@danieldeusing.de"
              className="text-accent hover:underline"
            >
              info@danieldeusing.de
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Responsible for Content (§ 18 Abs. 2 MStV)
          </h2>
          <p className="text-subtext">
            Daniel Deusing<br />
            Rosenbergstr. 32<br />
            56579 Hardert, Germany
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            EU Dispute Resolution
          </h2>
          <p className="text-subtext">
            The European Commission provides a platform for online dispute resolution (ODR):{" "}
            <a
              href="https://ec.europa.eu/consumers/odr/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p className="text-subtext mt-2">
            We are neither willing nor obliged to participate in dispute resolution
            proceedings before a consumer arbitration board.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Liability for Content
          </h2>
          <p className="text-subtext">
            The contents of our pages were created with the greatest care. However,
            we cannot guarantee the accuracy, completeness and timeliness of the
            content. As a service provider, we are responsible for our own content
            on these pages according to § 7 Abs.1 DDG. According to §§ 8 to 10 DDG,
            however, we are not obliged as a service provider to monitor transmitted
            or stored third-party information or to investigate circumstances that
            indicate illegal activity.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Liability for Links
          </h2>
          <p className="text-subtext">
            Our offer contains links to external websites of third parties, on whose
            contents we have no influence. Therefore, we cannot assume any liability
            for these external contents. The respective provider or operator of the
            pages is always responsible for the contents of the linked pages.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Copyright</h2>
          <p className="text-subtext">
            The content and works on these pages created by the site operators are
            subject to German copyright law. Duplication, processing, distribution
            and any kind of use outside the limits of copyright law require the
            written consent of the respective author or creator.
          </p>
        </section>
      </div>
    </div>
  );
}
