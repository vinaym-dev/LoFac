// scripts/supercommit/printEnv.js
console.log("Effective Super Commit environment:");
const keys = [
  'JIRA_BASE_URL','JIRA_EMAIL','JIRA_API_TOKEN','JIRA_READY_FIELD_ID',
  'TEMPO_TOKEN','TEMPO_AUTHOR_ACCOUNT_ID','TEMPO_CATEGORY_KEY','DRY_RUN'
];
for (const k of keys) {
  const val = process.env[k] ? (k.includes("TOKEN") ? "(set)" : process.env[k]) : "(unset)";
  console.log(` - ${k}: ${val}`);
}
