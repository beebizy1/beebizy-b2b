UPDATE "workspaces"
SET "experience" = 'santa-clara'
WHERE "id" IN (
	SELECT "workspace_id"
	FROM "workspace_invites"
	WHERE lower("email") = 'poorvishukla27@gmail.com'
);
