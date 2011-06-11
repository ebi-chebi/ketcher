/****************************************************************************
 * Copyright (C) 2009-2010 GGA Software Services LLC
 * 
 * This file may be distributed and/or modified under the terms of the
 * GNU Affero General Public License version 3 as published by the Free
 * Software Foundation and appearing in the file LICENSE.GPL included in
 * the packaging of this file.
 * 
 * This file is provided AS IS with NO WARRANTY OF ANY KIND, INCLUDING THE
 * WARRANTY OF DESIGN, MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
 ***************************************************************************/

// chem.Struct constructor and utilities are defined here
if (!window.chem || !util.Vec2 || !util.Pool)
	throw new Error("Vec2, Pool should be defined first")

chem.Struct = function ()
{
	this.atoms = new util.Pool();
	this.bonds = new util.Pool();
	this.sgroups = new util.Pool();
	this.halfBonds = new util.Map();
	this.loops = new util.Pool();
	this.isChiral = false;
}

chem.Struct.prototype.toLists = function ()
{
	var aidMap = {};
	var atomList = [];
	this.atoms.each(function(aid, atom) {
		aidMap[aid] = atomList.length;
		atomList.push(atom);
	});

	var bondList = [];
	this.bonds.each(function(bid, bond) {
		var b = Object.clone(bond);
		b.begin = aidMap[bond.begin];
		b.end = aidMap[bond.end];
		bondList.push(b);
	});

	return {
		'atoms': atomList,
		'bonds': bondList
	};
}

chem.Struct.prototype.clone = function ()
{
	var cp = new chem.Struct();
	var aidMap = {};
	this.atoms.each(function(aid, atom) {
		aidMap[aid] = cp.atoms.add(atom.clone());
	});

	var bidMap = {};
	this.bonds.each(function(bid, bond) {
		bidMap[bid] = cp.bonds.add(bond.clone(aidMap));
	});

	this.sgroups.each(function(sid, sg) {
		sg = chem.SGroup.clone(sg, aidMap, bidMap);
		var id = cp.sgroups.add(sg);
		sg.id = id;
		for (var i = 0; i < sg.atoms.length; ++i) {
			util.Set.add(cp.atoms.get(sg.atoms[i]).sgs, id);
		}
	});
	cp.isChiral = this.isChiral;

	return cp;
}

chem.Struct.prototype.findBondId = function (begin, end)
{
	var id = -1;
    
	this.bonds.find(function (bid, bond)
	{
		if ((bond.begin == begin && bond.end == end) ||
			(bond.begin == end && bond.end == begin))
			{
			id = bid;
			return true;
		}
		return false;
	}, this);
    
	return id;
}

chem.Struct.prototype.merge = function (mol)
{
	var aidMap = {};
	mol.atoms.each(function(aid, atom){
		aidMap[aid] = this.atoms.add(atom);
	}, this);
	mol.bonds.each(function(bid, bond){
		var params = new chem.Struct.Bond(bond);
		params.begin = aidMap[bond.begin];
		params.end = aidMap[bond.end];
		this.bonds.add(params);
	}, this);
}

chem.Struct.ATOM =
{
	RADICAL:
	{
		NONE:    0,
		SINGLET: 1,
		DOUPLET: 2,
		TRIPLET: 3
	}
};

chem.Struct.radicalElectrons = function(radical)
{
	radical = radical - 0;
	if (radical == chem.Struct.ATOM.RADICAL.NONE)
		return 0;
	else if (radical == chem.Struct.ATOM.RADICAL.DOUPLET)
		return 1;
	else if (radical == chem.Struct.ATOM.RADICAL.SINGLET ||
		radical == chem.Struct.ATOM.RADICAL.TRIPLET)
		return 2;
	throw new Error("Unknown radical value");
}

chem.Struct.BOND =
{
	TYPE:
	{
		SINGLE: 1,
		DOUBLE: 2,
		TRIPLE: 3,
		AROMATIC: 4,
		SINGLE_OR_DOUBLE: 5,
		SINGLE_OR_AROMATIC: 6,
		DOUBLE_OR_AROMATIC: 7,
		ANY : 8
	},

	STEREO:
	{
		NONE: 0,
		UP: 1,
		EITHER: 4,
		DOWN: 6,
		CIS_TRANS: 3
	},

	TOPOLOGY:
	{
		EITHER: 0,
		RING: 1,
		CHAIN: 2
	}
};

chem.Struct.FRAGMENT = {
	NONE:0,
	REACTANT:1,
	PRODUCT:2,
	AGENT:3
};

chem.Struct.prototype.merge = function (mol)
{
	var aidMap = {};
	mol.atoms.each(function(aid, atom){
		aidMap[aid] = this.atoms.add(atom);
	}, this);
	mol.bonds.each(function(bid, bond){
		var params = new chem.Struct.Bond(bond);
		params.begin = aidMap[bond.begin];
		params.end = aidMap[bond.end];
		this.bonds.add(params);
	}, this);
}

chem.Struct.Atom = function (params)
{
	if (!params || !('label' in params))
		throw new Error("label must be specified!");

	this.label = params.label;
	util.ifDef(this, params, 'isotope', 0);
	util.ifDef(this, params, 'radical', 0);
	util.ifDef(this, params, 'charge', 0);
	util.ifDef(this, params, 'valence', 0);
	util.ifDef(this, params, 'explicitValence', 0);
	util.ifDef(this, params, 'implicitH', 0);
	if (!Object.isUndefined(params.pos))
		this.pos = new util.Vec2(params.pos);
	else
		this.pos = new util.Vec2();
	this.pp = new util.Vec2();
	this.ps = new util.Vec2();

	this.sgs = {};

	// query
	util.ifDef(this, params, 'ringBondCount', -1);
	util.ifDef(this, params, 'substitutionCount', -1);
	util.ifDef(this, params, 'unsaturatedAtom', -1);

	this.atomList = !Object.isUndefined(params.atomList) && params.atomList != null ? new chem.Struct.AtomList(params.atomList) : null;
	this.neighbors = []; // set of half-bonds having this atom as their origin
}

chem.Struct.Atom.prototype.clone = function ()
{
	return new chem.Struct.Atom(this);
}

chem.Struct.Atom.prototype.isQuery =  function ()
{
	return this.atomList != null || this.label == 'A';
}

chem.Struct.Atom.prototype.pureHydrogen =  function ()
{
	return this.label == 'H' && this.isotope == 0;
}

chem.Struct.Atom.prototype.isPlainCarbon =  function ()
{
	return this.label == 'C' && this.isotope == 0 && this.isotope == 0 &&
		this.radical == 0 && this.charge == 0 && this.explicitValence == 0 &&
		this.ringBondCount == -1 && this.substitutionCount == -1 && this.unsaturatedAtom == -1 &&
		!this.atomList;
}

chem.Struct.AtomList = function (params)
{
	if (!params || !('notList' in params) || !('ids' in params))
		throw new Error("'notList' and 'ids' must be specified!");

	this.notList = params.notList; /*boolean*/
	this.ids = params.ids; /*Array of integers*/
}

chem.Struct.AtomList.prototype.labelList = function ()
{
	var labels = [];
	for (var i = 0; i < this.ids.length; ++i)
		labels.push(chem.Element.elements.get(this.ids[i]).label);
	return labels;
}

chem.Struct.AtomList.prototype.label = function ()
{
	var label = "[" + this.labelList().join(",") + "]";
	if (this.notList)
		label = "!" + label;
	return label;
}

chem.Struct.Bond = function (params)
{
	if (!params || !('begin' in params) || !('end' in params) || !('type' in params))
		throw new Error("'begin', 'end' and 'type' properties must be specified!");

	this.begin = params.begin;
	this.end = params.end;
	this.type = params.type;
	util.ifDef(this, params, 'stereo', chem.Struct.BOND.STEREO.NONE);
	util.ifDef(this, params, 'topology', chem.Struct.BOND.TOPOLOGY.EITHER);
	util.ifDef(this, params, 'reactingCenterStatus', 0);
	this.hb1 = null; // half-bonds
	this.hb2 = null;
	this.len = 0;
	this.center = new util.Vec2();
	this.sb = 0;
	this.sa = 0;
	this.angle = 0;
}

chem.Struct.Bond.prototype.clone = function (aidMap)
{
	var cp = new chem.Struct.Bond(this);
	if (aidMap) {
		cp.begin = aidMap[cp.begin];
		cp.end = aidMap[cp.end];
	}
	return cp;
}

chem.Struct.Bond.prototype.findOtherEnd = function (i)
{
	if (i == this.begin)
		return this.end;
	if (i == this.end)
		return this.begin;
	throw new Error("bond end not found");
}

chem.HalfBond = function (/*num*/begin, /*num*/end, /*num*/bid)
{
	if (arguments.length != 3)
		throw new Error("Invalid parameter number!");

	this.begin = begin - 0;
	this.end = end - 0;
	this.bid = bid - 0;

	// rendering properties
	this.dir = new util.Vec2(); // direction
	this.norm = new util.Vec2(); // left normal
	this.ang = 0; // angle to (1,0), used for sorting the bonds
	this.p = new util.Vec2(); // corrected origin position
	this.loop = -1; // left loop id if the half-bond is in a loop, otherwise -1
	this.contra = -1; // the half bond contrary to this one
	this.next = -1; // the half-bond next ot this one in CCW order
	this.leftSin = 0;
	this.leftCos = 0;
	this.leftNeighbor = 0;
	this.rightSin = 0;
	this.rightCos = 0;
	this.rightNeighbor = 0;
}

chem.Struct.prototype.initNeighbors = function ()
{
	this.atoms.each(function(aid, atom){
		atom.neighbors = [];
	});
	this.bonds.each(function(bid, bond){
		var a1 = this.atoms.get(bond.begin);
		var a2 = this.atoms.get(bond.end);
		a1.neighbors.push(bond.hb1);
		a2.neighbors.push(bond.hb2);
	}, this);
}

chem.Struct.prototype.bondInitHalfBonds = function (bid, /*opt*/ bond)
{
	bond = bond || this.bonds.get(bid);
	bond.hb1 = 2 * bid;
	bond.hb2 = 2 * bid + 1;
	this.halfBonds.set(bond.hb1, new chem.HalfBond(bond.begin, bond.end, bid));
	this.halfBonds.set(bond.hb2, new chem.HalfBond(bond.end, bond.begin, bid));
	var hb1 = this.halfBonds.get(bond.hb1);
	var hb2 = this.halfBonds.get(bond.hb2);
	hb1.contra = bond.hb2;
	hb2.contra = bond.hb1;
}

chem.Struct.prototype.halfBondUpdate = function (hbid)
{
	var hb = this.halfBonds.get(hbid);
	var p1 = this.atoms.get(hb.begin).pp;
	var p2 = this.atoms.get(hb.end).pp;
	var d = util.Vec2.diff(p2, p1).normalized();
	hb.dir = d;
	hb.norm = d.turnLeft();
	hb.ang = hb.dir.oxAngle();
}

chem.Struct.prototype.initHalfBonds = function ()
{
	this.halfBonds.clear();
	this.bonds.each(this.bondInitHalfBonds, this);
}

chem.Struct.prototype.setHbNext = function (hbid, next)
{
	this.halfBonds.get(this.halfBonds.get(hbid).contra).next = next;
}

chem.Struct.prototype.halfBondSetAngle = function (hbid, left)
{
	var hb = this.halfBonds.get(hbid);
	var hbl = this.halfBonds.get(left);
	hbl.rightCos = hb.leftCos = util.Vec2.dot(hbl.dir, hb.dir);
	hbl.rightSin = hb.leftSin = util.Vec2.cross(hbl.dir, hb.dir);
	hb.leftNeighbor = left;
	hbl.rightNeighbor = hbid;
}

chem.Struct.prototype.atomAddNeighbor = function (hbid)
{
	var hb = this.halfBonds.get(hbid);
	var atom = this.atoms.get(hb.begin);
	var i = 0;
	for (i = 0; i < atom.neighbors.length; ++i)
		if (this.halfBonds.get(atom.neighbors[i]).ang > hb.ang)
			break;
	atom.neighbors.splice(i, 0, hbid);
	var ir = atom.neighbors[(i + 1) % atom.neighbors.length];
	var il = atom.neighbors[(i + atom.neighbors.length - 1)
	% atom.neighbors.length];
	this.setHbNext(il, hbid);
	this.setHbNext(hbid, ir);
	this.halfBondSetAngle(hbid, il);
	this.halfBondSetAngle(ir, hbid);
}

chem.Struct.prototype.atomSortNeighbors = function (aid) {
	var atom = this.atoms.get(aid);
	atom.neighbors = atom.neighbors.sortBy(function(nei){
		return this.halfBonds.get(nei).ang;
	}, this);

	var i;
	for (i = 0; i < atom.neighbors.length; ++i)
		this.halfBonds.get(this.halfBonds.get(atom.neighbors[i]).contra).next =
		atom.neighbors[(i + 1) % atom.neighbors.length];
	for (i = 0; i < atom.neighbors.length; ++i)
		this.halfBondSetAngle(atom.neighbors[(i + 1) % atom.neighbors.length],
			atom.neighbors[i]);
}

chem.Struct.prototype.atomUpdateHalfBonds = function (aid) {
	var nei = this.atoms.get(aid).neighbors;
	for (var i = 0; i < nei.length; ++i) {
		var hbid = nei[i];
		this.halfBondUpdate(hbid);
		this.halfBondUpdate(this.halfBonds.get(hbid).contra);
	}
}

chem.Struct.prototype.sGroupsRecalcCrossBonds = function () {
	this.sgroups.each(function(sgid, sg){
		sg.xBonds = [];
		sg.neiAtoms = [];
	},this);
	this.bonds.each(function(bid, bond){
		var a1 = this.atoms.get(bond.begin);
		var a2 = this.atoms.get(bond.end);
		util.Set.each(a1.sgs, function(sgid){
			if (!util.Set.contains(a2.sgs, sgid)) {
				var sg = this.sgroups.get(sgid);
				sg.xBonds.push(bid);
				util.arrayAddIfMissing(sg.neiAtoms, bond.end);
			}
		}, this);
		util.Set.each(a2.sgs, function(sgid){
			if (!util.Set.contains(a1.sgs, sgid)) {
				var sg = this.sgroups.get(sgid);
				sg.xBonds.push(bid);
				util.arrayAddIfMissing(sg.neiAtoms, bond.begin);
			}
		}, this);
	},this);
}

chem.Struct.prototype.getObjBBox = function ()
{
	var bb = null;
	this.atoms.each(function (aid, atom) {
		if (!bb)
			bb = {
				min: atom.pos,
				max: atom.pos
			}
		else {
			bb.min = util.Vec2.min(bb.min, atom.pos);
			bb.max = util.Vec2.max(bb.max, atom.pos);
		}
	});
	if (!bb)
		bb = {
			min: new util.Vec2(0, 0),
			max: new util.Vec2(1, 1)
		};
	return new util.Box2Abs(bb.min, bb.max);
}

chem.Struct.prototype.sGroupDelete = function (sgid)
{
	var sg = this.sgroups.get(sgid);
	for (var i = 0; i < sg.atoms.length; ++i) {
		util.Set.remove(this.atoms.get(sg.atoms[i]).sgs, sgid);
	}
	this.sgroups.remove(sgid);
}

chem.Struct.prototype._atomSetPos = function (aid, pp, scaleFactor)
{
	var atom = this.atoms.get(aid);
	atom.pp = pp;
	atom.pos = new util.Vec2(pp.x, -pp.y);
	if (scaleFactor)
		atom.ps = atom.pp.scaled(scaleFactor);
}

chem.Struct.prototype.coordShiftFlipScale = function(min, scale)
{
	this.atoms.each(function (aid, atom) {
		this._atomSetPos(aid, atom.pp
			.sub(min)
			.yComplement(0)
			.scaled(scale));
	}, this);

	this.sgroups.each(function (sgid, sg) {
		if (sg.p) {
			sg.pr = sg.p
			.yComplement(0)
			.scaled(scale);
			sg.p = sg.p.sub(min);
			sg.pa = sg.p
			.yComplement(0)
			.scaled(scale);
		}
	}, this);
}

chem.Struct.prototype.getCoordBoundingBox = function ()
{
	var bb = null;
	this.atoms.each(function (aid, atom) {
		if (!bb)
			bb = {
				min: atom.pp,
				max: atom.pp
			}
		else {
			bb.min = util.Vec2.min(bb.min, atom.pp);
			bb.max = util.Vec2.max(bb.max, atom.pp);
		}
	});
	if (!bb)
		bb = {
			min: new util.Vec2(0, 0),
			max: new util.Vec2(1, 1)
		};
	return bb;
}

chem.Struct.prototype.getAvgBondLength = function ()
{
	var totalLength = 0;
	var cnt = 0;
	this.bonds.each(function(bid, bond){
		totalLength += util.Vec2.dist(
			this.atoms.get(bond.begin).pp,
			this.atoms.get(bond.end).pp);
		cnt++;
	}, this);
	return cnt > 0 ? totalLength / cnt : -1;
}

chem.Struct.prototype.getAvgClosestAtomDistance = function ()
{
	var totalDist = 0, minDist, dist = 0;
	var keys = this.atoms.keys(), k, j;
	for (k = 0; k < keys.length; ++k) {
		minDist = -1;
		for (j = 0; j < keys.length; ++j) {
			if (j == k)
				continue;
			dist = util.Vec2.dist(this.atoms.get(keys[j]).pp, this.atoms.get(keys[k]).pp);
			if (minDist < 0 || minDist > dist)
				minDist = dist;
		}
		totalDist += minDist;
	}

	return keys.length > 0 ? totalDist / keys.length : -1;
}

chem.Struct.prototype.coordProject = function()
{
	this.atoms.each(function (aid, atom) {// project coordinates
		this._atomSetPos(aid, new util.Vec2(atom.pos.x, atom.pos.y));
	}, this);
}

chem.Struct.prototype.checkBondExists = function (begin, end)
{
	var bondExists = false;
	this.bonds.each(function(bid, bond){
		if ((bond.begin == begin && bond.end == end) ||
			(bond.end == begin && bond.begin == end))
			bondExists = true;
	}, this);
	return bondExists;
}

chem.Loop = function (/*Array of num*/hbs, /*Struct*/struct, /*bool*/convex)
{
	this.hbs = hbs; // set of half-bonds involved
	this.dblBonds = 0; // number of double bonds in the loop
	this.aromatic = true;
	this.convex = convex || false;
	
	hbs.each(function(hb){
		var bond = struct.bonds.get(struct.halfBonds.get(hb).bid);
		if (bond.type != chem.Struct.BOND.TYPE.AROMATIC)
			this.aromatic = false;
		if (bond.type == chem.Struct.BOND.TYPE.DOUBLE)
			this.dblBonds++;
	}, this);
}
