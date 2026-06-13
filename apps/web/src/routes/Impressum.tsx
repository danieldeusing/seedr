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

      <div className="max-w-none space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Information according to § 5 DDG
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
            Liability for Content
          </h2>
          <p className="text-subtext">
            I create the contents of these pages with great care, but I cannot
            guarantee that they are accurate, complete, or up to date. As a
            service provider I am responsible for my own content on these pages
            in accordance with § 7 Abs. 1 DDG. According to §§ 8 to 10 DDG,
            however, I am not obliged to monitor transmitted or stored
            third-party information or to investigate circumstances that
            indicate illegal activity.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Liability for Links
          </h2>
          <p className="text-subtext">
            This site contains links to external third-party websites over
            whose content I have no influence. I therefore cannot accept any
            liability for this external content; the respective provider or
            operator of the linked pages is always responsible for it. The
            linked pages were checked for possible legal violations at the time
            of linking. Should I become aware of any infringement, I will
            remove the affected link immediately.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Copyright</h2>
          <p className="text-subtext">
            The content and works on these pages that I created are subject to
            German copyright law. Duplication, processing, distribution, and
            any kind of exploitation outside the limits of copyright law
            require my written consent. Registry content from third parties
            (community items) remains subject to the license terms of the
            respective authors and repositories.
          </p>
        </section>
      </div>
    </div>
  );
}
