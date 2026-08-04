-- The marker is advanced only through an admin reply already rendered to the
-- user. Existing conversations remain unread until the user opens support.
ALTER TABLE "SupportConversation"
ADD COLUMN "userLastReadAt" DATETIME;
