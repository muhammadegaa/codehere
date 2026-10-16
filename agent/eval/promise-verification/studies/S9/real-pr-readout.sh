#!/usr/bin/env bash
# Read-only readout of the five real pull requests in the throwaway repo. Writes nothing to GitHub.
set -uo pipefail
R=muhammadegaa/codehere-receipt-test
echo "## repo"; gh repo view $R --json visibility,url --jq '"\(.visibility) \(.url)"'
echo "## workflow runs (branch, event, conclusion)"
gh run list -R $R --limit 12 --json databaseId,headBranch,event,status,conclusion --jq '.[] | "\(.headBranch)\t\(.event)\t\(.status)\t\(.conclusion)\trun \(.databaseId)"' | sort
echo "## receipt comments"
for n in 1 2 3 4 5; do
  b=$(gh pr view $n -R $R --json headRefName --jq .headRefName)
  echo "### PR $n $b | comments: $(gh pr view $n -R $R --json comments --jq '.comments | length')"
  gh pr view $n -R $R --json comments --jq '.comments[] | "author=\(.author.login)\n\(.body)"'
done
echo "## receipt SHA vs PR head SHA"
for n in 1 2 3 4; do
  h=$(gh pr view $n -R $R --json headRefOid --jq .headRefOid | cut -c1-7)
  r=$(gh pr view $n -R $R --json comments --jq '.comments[0].body' | grep -oE 'on commit `[0-9a-f]+`' | grep -oE '[0-9a-f]{7,}')
  [ "$h" = "$r" ] && s=same || s=DIFFERENT
  echo "PR $n head=$h receipt=$r $s"
done
echo "## can a fresh clone resolve the receipt SHA (the Reproduce line)?"
T=$(mktemp -d); git clone -q https://github.com/$R.git "$T/c"; cd "$T/c"
for n in 1 2; do
  r=$(gh pr view $n -R $R --json comments --jq '.comments[0].body' | grep -oE 'on commit `[0-9a-f]+`' | grep -oE '[0-9a-f]{7,}')
  if git cat-file -e "$r^{commit}" 2>/dev/null; then echo "PR $n $r: found in a fresh clone"; else echo "PR $n $r: NOT found in a fresh clone"; fi
done
git fetch -q origin 'refs/pull/1/merge:refs/tmp/pr1merge' && echo "after fetching refs/pull/1/merge the tip is $(git rev-parse --short refs/tmp/pr1merge)"
cd / && rm -rf "$T"
