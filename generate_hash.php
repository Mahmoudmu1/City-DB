<?php
$plain = 'admin123';
$hash = password_hash($plain, PASSWORD_BCRYPT);
var_dump($hash);
