import React, { Component, PropTypes } from 'react'
import { connect } from 'react-redux'
import { Link } from 'react-router'
import queryString from 'query-string'

import actions from '../../../actions'

import Loading from '../../../components/Loading'

import Main from '../../../components/Main'

const { site } = __CONFIG__

const title = '标签列表'



var componentServerMount
if (__SERVER__) {
  componentServerMount = async function componentServerMount(ctx, state) {
    state.path = this.context.getPath()
    this.props.dispatch(actions.addTagList(state))
  }
}



@connect(state => ({
  tagList: state.get('tagList'),
  routing: state.get('routing'),
  token: state.get('token'),
}))
export default class Index extends Component {
  static contextTypes = {
    router: React.PropTypes.object.isRequired,
    fetch: React.PropTypes.func.isRequired,
    getPath: React.PropTypes.func.isRequired,
    toUrl: React.PropTypes.func.isRequired,
  }

  state = {
    loading: false,
  }


  componentServerMount = componentServerMount

  componentWillMount() {
    if (!__SERVER__) {
      if (this.props.tagList.get('path') != this.context.getPath(this.props)) {
        this.props.dispatch(actions.clearTagList())
        this.fetch(this.props)
      }
    }
  }

  componentDidMount() {
    if (this.props.tagList.get('path') == this.context.getPath(this.props) && this.props.tagList.get('messages')) {
      this.props.dispatch(actions.setMessages(this.props.tagList.toJS(), 'danger', 'popup'))
    }
  }

  componentWillReceiveProps(nextProps) {
    var props = this.props
    if (this.state.loading || this.context.getPath(props) == this.context.getPath(nextProps)) {
      return
    }
    if (!this.isMore) {
      this.props.dispatch(actions.clearTagList())
    } else if (!props.tagList.get('more')) {
      return
    }
    this.isMore = false
    this.fetch(nextProps)
  }


  async fetch(props) {
    if (this.state.loading) {
      return false
    }
    this.setState({loading: true})
    try {
      var result = await this.context.fetch('/tags', props.location.query)
      props.dispatch(actions.addTagList(result))
    } catch (e) {
      props.dispatch(actions.setMessages([e, '请重试'], 'danger', 'popup'))
    } finally {
      this.setState({loading: false})
    }
  }

  onMore = (e) => {
    e.preventDefault();
    this.isMore = true
    this.context.router.push(e.target.pathname + e.target.search)
  }



  render () {
    var headers = {
      html: {},
      title: [],
      meta: [],
      link: [],
      breadcrumb: [],
    }
    var query = {}
    var next
    var prev

    headers.html.prefix  = 'og:http://ogp.me/ns#'


    var tagList = this.props.tagList

    var location = this.props.location

    var page = parseInt(location.query.page || 1)
    if (isNaN(page)) {
      page = 1
    }
    var search = (location.query.search || '').trim()



    if (search) {
      query.search = search
      headers.title.push('搜索 '+ search +' 的结果')
    }


    if (page > 1) {
      query.page = page
      headers.title.push('第' + page + '页')
    }

    // 带有搜索
    if (search) {
      headers.meta.push({name:'robots', content: 'none'})
    }



    headers.link.push({rel:'canonical', type: 'text/html', href: this.context.toUrl(location.pathname, query)})


    if (query.page > 1) {
      headers.link.push({rel:'prev', type: 'text/html', href: this.context.toUrl(location.pathname, Object.assign({}, query, {page:query.page == 2 ? undefined : query.page - 1}))})
      let search = queryString.stringify(Object.assign({}, query, {page:query.page == 2 ? undefined : query.page - 1}))
      prev = location.pathname + (search ? '?' + search : '')
    }

    if (tagList.get('more')) {
      headers.link.push({rel:'next', type: 'text/html', href: this.context.toUrl(location.pathname, Object.assign({}, query, {page:query.page + 1})) })
      next = location.pathname + '?' + queryString.stringify(Object.assign({}, query, {page: page + 1}))
    }


    headers.title.push(title, site.title)

    headers.breadcrumb.push(title)







    var menu = ''
    if (this.props.token.get('admin')) {
      menu = <section id="admin-menu">
        <ul id="admin-menu-fixed" className="nav flex-column">
          <li className="link-item">{this.props.location.query.state == -1 ? <Link to="/tags" className="link-link">已发布</Link> : <Link to="/tags?state=-1" className="link-link">已禁用</Link>}</li>
          <li  className="link-item"><Link to="/tags/create" className="link-link">创建</Link></li>
        </ul>
      </section>
    }


    return <Main {...headers}>
      <section id="content">
        <div id="tags-index">
          <h1 className="title">标签</h1>
          <ul className="tags-list">
            {tagList.get('results').map((tag, key) => {
              return (
                <li key={tag.get('_id')}><Link to={tag.get('postUri')} rel="tag" className="btn btn-outline-primary" title={tag.getIn(['names', 0])}>{tag.getIn(['names', 0]) + '('+ tag.get('count') +')'}</Link></li>
              )
            })}
          </ul>
          <nav className="navigation pagination" role="navigation">
            {this.state.loading ? <Loading></Loading> : ''}
            {next && !this.state.loading ? <Link to={next} className="more" onClick={this.onMore} rel="next">加载更多</Link> : ''}
            {next || this.state.loading ? '' : <span className="loaded">全部已加载完毕</span>}
            {prev ? <Link to={prev} className="prev" rel="prev">上一页</Link> : ''}
            {next ? <Link to={next} className="next" rel="next">下一页</Link> : ''}
          </nav>
        </div>
      </section>
      {menu}
    </Main>
  }
}
