UPDATE prediction_fights 
SET fighter_a_photo = NULL 
WHERE fighter_a_photo = 'https://polymarket-upload.s3.us-east-2.amazonaws.com/ufc-logo-37bbbd28e6.png'
AND status IN ('open', 'locked', 'live');