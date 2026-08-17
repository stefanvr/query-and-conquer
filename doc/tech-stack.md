# tech stack

Web based video game

## base 
* html
* css
* (plain) javascript

## architecture

* modular design 
* CQRS
    
## hosting

* Git hub pages

## tech choices

* live-server

## Design choices fro v1
* Save system - start with localStorage - risk not enough storage for now accepted
* Pre-generated maps 
  * at build time as static JSON files checked into the repo/shipped as assets
  * create sepparate script for generating maps
  * only build maps when generation scipt is changes
* AI computation cost - on main thread - risk UI freezing for now accepted
  
* Modular design - native ES modules
* Use CQRS loosely — just "separate the code that mutates state from the code that reads/renders it"

* Rendering approach for the hex grid - use canvas

* Browser target: no need for legacy support, but keep it a most used
* Dev tooling: make sure it can be run locally with live update
* Testing: no testing 

