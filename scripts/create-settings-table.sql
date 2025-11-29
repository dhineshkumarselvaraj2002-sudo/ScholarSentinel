-- Create settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS "settings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "geminiApiKey" TEXT,
  "openAlexApiKey" TEXT,
  "crossrefApiKey" TEXT,
  "pdfServiceUrl" TEXT DEFAULT 'http://localhost:8000',
  "sendGridApiKey" TEXT,
  "slackWebhookUrl" TEXT,
  "discordWebhookUrl" TEXT,
  "bingVisualSearchApiKey" TEXT,
  "bingVisualSearchEndpoint" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Insert default settings row if it doesn't exist
INSERT INTO "settings" ("id", "pdfServiceUrl", "createdAt", "updatedAt")
VALUES ('settings', 'http://localhost:8000', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

