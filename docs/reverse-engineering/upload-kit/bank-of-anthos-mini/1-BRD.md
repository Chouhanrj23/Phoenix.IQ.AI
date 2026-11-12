# Bank of Anthos — Business Requirements Document (DRAFT v0.4)

> Status: **incomplete draft** — sections marked _TBD_ still need input from the product and engineering teams.
> Owner: Retail Digital Banking · Last edited by the business analysis team

## 1. Background

Bank of Anthos is our online retail bank. Customers open an account on the website, see their balance and
history, pay people and pull money in from accounts they hold at other banks. The platform was rebuilt as
cloud services a while ago and the original requirements were never written down properly. This draft
collects what the business believes the system does and should do.

## 2. Objectives

- Let customers open an account fully online, without a branch visit.
- Give customers an up-to-date balance and transaction history.
- Make paying another person quick and safe.
- _TBD — regulatory objectives (KYC/AML, reporting) — waiting on Compliance._

## 3. Users

| User            | Description                                    |
| --------------- | ---------------------------------------------- |
| Retail customer | Uses the website on desktop or mobile browser  |
| Operations team | Keeps the platform running, watches dashboards |
| _TBD_           | Are there back-office / branch staff users?    |

## 4. Scope

**In scope:** sign-up, login, balance, transaction history, payments, deposits, saved contacts.

**Out of scope for this release:** _TBD_ (cards? loans? — product to confirm).

## 5. Functional requirements

### 5.1 Onboarding & login (Overview / Accounts)

- FR-01 A customer signs up with a username, password, name, address, date of birth and SSN.
- FR-02 The customer receives a 10-digit account number straight after sign-up.
- FR-03 Login uses username and password. _TBD: do we have two-factor authentication? Security says yes, nobody can find it._
- FR-04 A session stays signed in for about 15 minutes of inactivity, then logs out.
- FR-05 Other applications can access a customer's account only after the customer approves it.

### 5.2 Accounts

- FR-06 The home page shows the current balance.
- FR-07 Customers have a checking account and a savings account.
- FR-08 Customers can save contacts (payees) — people at this bank and accounts at other banks.

### 5.3 Payments and transfers

- FR-09 Pay another customer of the bank from a saved contact or by account number.
- FR-10 Customers can go overdrawn by up to $500 on payments.
- FR-11 A payment must not go through twice if the customer double-clicks.
- FR-12 _TBD — daily payment limits? fees?_

### 5.4 Deposits

- FR-13 Deposit money from an external bank account (account + routing number).
- FR-14 _TBD — how long until deposited money is available?_

### 5.5 Cards

- _TBD — the business wants debit cards (issue, freeze, replace). Not sure if anything exists today._

### 5.6 Loans

- _TBD — personal loans were discussed for next year._

## 6. Reports

- Customers see their transaction history on the website.
- _TBD — monthly statements, regulatory reports, reconciliation._

## 7. Non-functional requirements

- NFR-01 Website available 24/7. _TBD target (99.9%?)_
- NFR-02 Pages load in under 2 seconds. _TBD — measured where?_
- NFR-03 Operations can see the health of every service and trace slow requests.
- NFR-04 Passwords are stored securely.

## 8. Open questions

1. Which services make up the platform and who owns them?
2. What data do we hold about customers and transactions?
3. Do we integrate with any external providers (KYC, card processor, payment rail)?
4. What happens when the balance check and the payment happen at the same time?
