# DIU Campus Ride Sharing Portal — Manual Testing Guide

## 1. Purpose
This document describes the manual testing scenarios for checking the major functionalities of the DIU Campus Ride Sharing Portal.

## 2. Authentication Testing

| Test ID | Test Scenario | Expected Result |
|---|---|---|
| AUTH-01 | Register with valid DIU email | Account registration succeeds |
| AUTH-02 | Register with invalid email | Invalid email is rejected |
| AUTH-03 | Register with existing email | Duplicate registration is rejected |
| AUTH-04 | Login with correct credentials | User successfully logs in |
| AUTH-05 | Login with incorrect credentials | Login is rejected |
| AUTH-06 | Logout from account | Session ends successfully |

## 3. Ride Management Testing

| Test ID | Test Scenario | Expected Result |
|---|---|---|
| RIDE-01 | Create a ride with valid information | Ride is created successfully |
| RIDE-02 | Search for available rides | Matching rides are displayed |
| RIDE-03 | View ride details | Correct ride information is displayed |
| RIDE-04 | Edit an owned ride | Ride information is updated |
| RIDE-05 | Cancel an owned ride | Ride cancellation is processed |

## 4. Passenger Request Testing

| Test ID | Test Scenario | Expected Result |
|---|---|---|
| PASS-01 | Create a passenger request | Request is created successfully |
| PASS-02 | View passenger request details | Correct request information is displayed |
| PASS-03 | Search for compatible ride offers | Matching offers are displayed |
| PASS-04 | Accept a compatible offer | Request and ride connection is processed |

## 5. Driver Management Testing

| Test ID | Test Scenario | Expected Result |
|---|---|---|
| DRV-01 | Apply to become a driver | Application is submitted |
| DRV-02 | Admin reviews driver application | Application details are visible |
| DRV-03 | Admin approves driver application | Driver approval status is updated |
| DRV-04 | Admin rejects driver application | Application is rejected |

## 6. Messaging Testing

| Test ID | Test Scenario | Expected Result |
|---|---|---|
| MSG-01 | Open a conversation | Conversation opens successfully |
| MSG-02 | Send a message | Message is delivered and displayed |
| MSG-03 | Receive a new message | Message appears in conversation |

## 7. Notification Testing

| Test ID | Test Scenario | Expected Result |
|---|---|---|
| NOT-01 | Receive a ride-related notification | Notification is displayed |
| NOT-02 | Open notifications | Notification list is visible |
| NOT-03 | Mark notification as read | Read status is updated |

## 8. Administration Testing

| Test ID | Test Scenario | Expected Result |
|---|---|---|
| ADM-01 | Open admin dashboard | Dashboard information is displayed |
| ADM-02 | View registered users | User list is displayed |
| ADM-03 | Manage rides | Ride management functions work |
| ADM-04 | Review safety reports | Reports are displayed for review |

## 9. UI and Usability Testing

- Verify navigation between pages.
- Check modal opening and closing.
- Verify buttons respond correctly.
- Check forms for validation messages.
- Verify layout on desktop and mobile screen sizes.
- Check loading states and error messages.

## 10. Conclusion
Manual testing helps verify that the major features of the DIU Campus Ride Sharing Portal behave as expected and that users can navigate and interact with the platform properly.
