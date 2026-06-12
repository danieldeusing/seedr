import { useEffect, useState } from "react";
import { Button } from "./ui/Button";

// Same key and values as the previous @toolr/ui-design banner, so existing consent state keeps working.
const STORAGE_KEY = "seedr-cookie-consent";

type ConsentChoice = "accepted" | "declined" | "essential";

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setIsVisible(true);
  }, []);

  const handleConsent = (choice: ConsentChoice) => {
    localStorage.setItem(STORAGE_KEY, choice);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-8 z-50 border-t border-border bg-card p-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-grow">
          <p className="text-sm text-foreground mb-1">
            <span className="text-primary">$</span> ./cookie-consent.sh
          </p>
          <p className="text-xs text-muted-foreground">
            This site uses only essential cookies for functionality. No tracking or analytics.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="xs" onClick={() => handleConsent("declined")}>
            Decline
          </Button>
          <Button variant="outline" size="xs" onClick={() => handleConsent("essential")}>
            Essential Only
          </Button>
          <Button size="xs" onClick={() => handleConsent("accepted")}>
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}
