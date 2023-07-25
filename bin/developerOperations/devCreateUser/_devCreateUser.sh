#!/bin/bash

# Set these variables
CALLSIGN="16"
EMAIL="mark+16@itserv.io"
PASSWORD="Fo0B@rBaz"
BUILD_POSTMAN="true"
VERBOSE="false"
# NUMBER_OF_USERS_TO_CREATE=2
# ---------------------

# counter=0
# slicedEmailUserId=$(echo "${EMAIL}" | cut -d "@" -f 1)
# slicedEmailDomain=$(echo "${EMAIL}" | cut -d "@" -f 2)

# while [ $counter -lt $NUMBER_OF_USERS_TO_CREATE ]
# do
#   ((counter++))

#   modifiedEmail="${slicedEmailUserId}+2${counter}@${slicedEmailDomain}"

#   VERBOSE="${VERBOSE}" \
#   email="${modifiedEmail}" \
#   callSign="${CALLSIGN}${counter}" \
#   firstName="fName${counter}" \
#   lastName="lName${counter}" \
#   password="${PASSWORD}" \
#   buildPostman="${BUILD_POSTMAN}" \
#   npx ts-node devCreateUser.ts
# done


VERBOSE="${VERBOSE}" \
email="${EMAIL}" \
callSign="${CALLSIGN}" \
firstName="fName" \
lastName="lName" \
password="${PASSWORD}" \
buildPostman="${BUILD_POSTMAN}" \
npx ts-node devCreateUser.ts