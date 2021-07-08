// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

export interface IReadingLink {
  duration?: number;
  url: string;
}

export interface ITocLink {
  url: string;
  title?: string;
  children?: ITocLink[];
}

export interface IWebPubView {
  identifier: string;
  title: string;
  authors: string[];
  publishers?: string[];
  workIdentifier?: string;
  description?: string;
  tags?: string[];
  languages?: string[];
  publishedAt?: string; // ISO8601
  cover?: string;

  RDFType?: string;
  duration?: number;
  nbOfTracks?: number;

  readingOrders: IReadingLink[];
  toc?: ITocLink[];
}
