

## Problem

The Referral Admin dashboard lives at `/referrals/admin` but there is no navigation link to it from the Prediction Admin page (`/predictions/admin`) or from the Navbar. You have to manually type the URL to reach it.

## Plan

### 1. Add a link to Referral Admin from the Prediction Admin page
- In `FightPredictionAdmin.tsx`, add a "Referral Dashboard" button/link near the top admin controls that navigates to `/referrals/admin`
- Only visible to authenticated admins

### 2. Add a link back from Referral Admin to Prediction Admin
- In `ReferralAdmin.tsx`, add a "Predictions Admin" link near the existing Back button so admins can navigate between the two dashboards

### 3. (Optional) Add Referral Admin to the Navbar admin section
- If there's an admin menu in the Navbar, add a link there too for quick access

This is a small navigation fix — no backend changes, no wallet/claim/settlement changes.

