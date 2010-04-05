<?
  // This script is a workaround for the fact that the last.fm "Submission Handshake" doesn't offer
  // JSONP or Cross Origin Resource Sharing. Use at your own discretion!

  $ch = curl_init();
  
  $url = 'http://post.audioscrobbler.com/?';
  // $url .= 'callback='.$_GET['callback'];
  $url .= '&hs=true&p=1.2.1&c=tst&v=1.0';
  $url .= '&u='.$_GET['u'];
  $url .= '&t='.$_GET['t'];
  $url .= '&a='.$_GET['a'];
  $url .= '&api_key='.$_GET['api_key'];
  $url .= '&sk='.$_GET['sk'];
  
  curl_setopt($ch, CURLOPT_URL, $url);
  curl_setopt($ch, CURLOPT_HTTPHEADER, array('Host: post.audioscrobbler.com'));
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  $output = curl_exec($ch);
  curl_close($ch);

  $output = split("[\n|\r]", $output);
  
  $str = $_GET['callback'] . "({";
  $str .= "'scrobbleSessionId' : '" . $output[1] . "', ";
  $str .= "'scrobbleNowPlayingUrl' : '" . $output[2] . "', ";
  $str .= "'scrobbleSubmissionUrl' : '" . $output[3] . "'";
  $str .= "})";
  
  echo $str;
?>