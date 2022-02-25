---
layout:     post
title:      "First bike ride"
date:       2009-11-02 09:55:00 -0600
categories: blog
tags:       November 2009 
author:     Jeff
comments:   false
published:  true
youtubeId:    iSOmsmuJmwc
---
Natalie learning to ride a bike!

{% include youtubePlayer.html id=page.youtubeId %}

{% for image in site.gallery-2009-11-02 %}
  [![{{ image.title}}]({{ image.thumb_url }})]({{ image.url | relative_url }})
{% endfor %}
