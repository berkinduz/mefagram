import newsletterExample from "../../../docs/examples/newsletter.json";
import { createDiagramSchema, validated } from "./schema";

// Keep the optional runtime example identical to the portable README fixture.
// All newsletter content is fictional; never include an owner's project data.
export function newsletterTemplate() {
  return validated(createDiagramSchema, newsletterExample.diagram);
}
