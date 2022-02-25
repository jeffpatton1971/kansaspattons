---
layout:     post
title:      "First bike ride"
date:       2009-11-02 09:55:00 -0600
categories: blog
tags:       November 2009 
author:     Jeff
comments:   false
published:  true
---
Natalie learning to ride a bike!

{% for image in site.gallery-2009-11-02 %}
  [![{{ image.title}}]({{ image.thumb_url }})]({{ image.url | relative_url }})
{% endfor %}
