# Retail Digital Banking — Initial BRD

_Version 1.0 · prepared by the business team · input to the Phoenix reverse-engineering run_

## Purpose

We want a simple online bank for retail customers: open an account, see money, move money.
This page lists what the business expects. Phoenix will check it against the existing system
and produce the full BRD.

## Who uses it

- Retail customers (web browser)
- Operations staff who keep the platform running

## What the business needs

### Accounts

1. A customer can sign up online with their name, date of birth, address and a username and password.
2. Each customer gets a bank account number immediately after sign-up.
3. A customer can hold both a checking and a savings account.
4. A customer can see their current balance on the home page.
5. A customer can save payees (contacts) to pay them again quickly.

### Payments and transfers

6. A customer can send money to another customer of the bank.
7. A customer can send money to an account at another bank using its routing number.
8. Customers may overdraw their account by up to $500.
9. The same payment must never be posted twice if the customer clicks submit again.
10. A customer can see the history of their transactions.

### Deposits

11. A customer can deposit money from an account at another bank.

### Cards

12. A customer can request a debit card and freeze it from the app.

### Loans

13. A customer can apply for a personal loan online and see the decision.

### Security and operations

14. Customers must log in with a one-time code (two-factor authentication).
15. A session should end after 15 minutes of inactivity.
16. Operations can see the health of each service and trace a slow request.

### Reports

17. Customers receive a monthly statement.
