define(["compose", "uber/when", "uber/listen", "./List"], function(Compose, when, listen, List){
return List.extend({
	create: Compose.after(function(params, srcNodeRef){
		var self = this;
		// check visibility on scroll events
		listen(this.scrollNode, "scroll", function(event){
			self.onscroll(event);
		});
		//this.inherited(arguments);
		
	}),
	renderQuery: function(query, preloadNode){
		// summary:
		//		Creates a preload node for rendering a query into, and executes the query
		//		for the first page of data. Subsequent data will be downloaded as it comes
		//		into view.
		preloadNode = preloadNode || this.createNode("div", {
			className: "preload"
		}, this.contentNode);
		// this preload node is used to represent the area of the table that hasn't been 
		// downloaded yet
		preloadNode.preload = true;
		preloadNode.query = query;
		preloadNode.start = this.minRowsPerPage;
		preloadNode.count = 0;
		var priorPreload = this.preloadNode;
		if(priorPreload){
			// the preload nodes (if there are multiple) are represented as a linked list, need to insert it
			if((preloadNode.next = priorPreload.next)){
				var previous = preloadNode.next.previous; 
			}
			preloadNode.previous = previous;
			preloadNode.next = preloadNode;
		}else{
			this.preloadNode = preloadNode;
		}
		var options = {start: 0, count: this.minRowsPerPage, query: query};
		// execute the query
		var results = query(options);
		var self = this;
		// render the result set
		when(this.renderCollection(results, preloadNode, options), function(trs){
			return when(results.total || results.length, function(total){
				// now we need to adjust the height and total count based on the first result set
				var height = 0;
				for(var i = 0, l = trs.length; i < l; i++){
					height += trs[i].offsetHeight;
				} 
				self.rowHeight = height / l;
				total -= trs.length;
				preloadNode.style.height = Math.min(total * self.rowHeight, self.maxEmptySpace) + "px";
				preloadNode.count = total;
				preloadNode.start = trs.length; 
				// can remove the loading node now
			});
		}, console.error);
		return preloadNode;
	},
	sortOrder: null,
	sort: function(attribute, descending){
		// summary:
		//		Sort the content
		this.sortOrder = [{attribute: attribute, descending: descending}];
		this.refreshContent();
	},
	refreshContent: Compose.after(function(){
		if(this.store){
			// render the query
			var self = this;
			this.renderQuery(function(queryOptions){
				queryOptions.sort = self.sortOrder;
				return self.store.query(self.query, queryOptions);
			});
		}		
	}),
	lastScrollTop: 0,
	onscroll: function(){
		// summary:
		//		Checks to make sure that everything in the viewable area has been 
		// 		downloaded, and triggering a request for the necessary data when needed.
		var scrollNode = this.scrollNode;
		var transform = this.contentNode.style.webkitTransform;
		var visibleTop = scrollNode.scrollTop + (transform ? -transform.match(/translate[\w]*\(.*?,(.*?)px/)[1] : 0);
		var visibleBottom = scrollNode.offsetHeight + visibleTop;
		var priorPreload, preloadNode = this.preloadNode;
		var lastScrollTop = this.lastScrollTop;
		this.lastScrollTop = visibleTop;
		
		// there can be multiple preloadNodes (if they split, or multiple queries are created),
		//	so we can traverse them until we find whatever is in the current viewport, making
		//	sure we don't backtrack
		while(preloadNode && preloadNode != priorPreload){
			priorPreload = this.preloadNode; 
			this.preloadNode = preloadNode;
			var preloadTop = preloadNode.offsetTop;
			var preloadHeight;
			if(visibleBottom < preloadTop){
				// the preload is below the line of site
				preloadNode = preloadNode.previous;
			}else if(visibleTop > (preloadTop + (preloadHeight = preloadNode.offsetHeight))){
				// the preload is above the line of site
				preloadNode = preloadNode.next;
			}else{
				// the preload node is visible, or close to visible, better show it
				var offset = (visibleTop - preloadTop) / this.rowHeight;
				var count = (visibleBottom - visibleTop) / this.rowHeight;
				// utilize momentum for predictions
				var momentum = Math.max(Math.min((visibleTop - lastScrollTop) * this.rowHeight, this.maxRowsPerPage/2), this.maxRowsPerPage/-2);
				count += Math.abs(momentum);
				if(momentum < 0){ 
					offset += momentum;
				}
				offset = Math.max(offset, 0);
				if(offset < 10 && offset > 0 && count + offset < this.maxRowsPerPage){
					// connect to the top of the preloadNode if possible to avoid splitting
					count += offset;
					offset = 0;
				}
				// TODO: do this for the bottom too
				count = Math.max(count, this.minRowsPerPage);
				count = Math.min(count, this.maxRowsPerPage);
				count = Math.min(count, preloadNode.count);
				if(count == 0){
					return;
				}
				offset = Math.round(offset);
				count = Math.round(count);
				var options = this.queryOptions ? Compose.create(this.queryOptions) : {};
				options.start = preloadNode.start + offset;
				options.count = count;
				if(offset > 0 && offset + count < preloadNode.count){
					// TODO: need to do a split 
					var second = document.clone(preloadNode);
				}else{
					preloadNode.start += count;
					preloadNode.count -= count;
					preloadNode.style.height = Math.min(preloadNode.count * this.rowHeight, this.maxEmptySpace);
				}
				// create a loading node as a placeholder while the data is loaded 
				var loadingNode = this.createNode("tr",{
					className: "d-list-loading",
					style: {
						height: count * this.rowHeight
					}
				});
				this.contentNode.insertBefore(loadingNode, preloadNode);
				// use the query associated with the preload node to get the next "page"
				options.query = preloadNode.query;
				console.log("query", options)
				var results = preloadNode.query(options);
				when(this.renderCollection(results, loadingNode, options),
					function(){
						// can remove the loading node now
						loadingNode.parentNode.removeChild(loadingNode);
					}, console.error);
			}
		}
	}	
});

});